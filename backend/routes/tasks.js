const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const ExcelJS = require('exceljs');

// Configure multer for CSV upload
const upload = multer({
  dest: 'uploads/csv/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(csv|xlsx)$/i.test(file.originalname);
    cb(allowed ? null : new Error('Chỉ hỗ trợ file .csv hoặc .xlsx'), allowed);
  },
});


async function ensureActiveCatalog(catalogType, name, db = pool) {
  const result = await db.query(
    'SELECT 1 FROM system_catalogs WHERE catalog_type=$1 AND name=$2 AND is_active=true',
    [catalogType, name]
  );
  if (!result.rowCount) {
    const error = new Error(`Giá trị “${name}” không tồn tại hoặc đã ngừng sử dụng trong danh mục ${catalogType}`);
    error.status = 400;
    throw error;
  }
}

const validateTask = [
  body('project_id').isInt().withMessage('Dự án không hợp lệ'),
];

async function resolveTaskDefinition(db, projectId, workItemId, taskType, taskName) {
  const project = await db.query('SELECT id,project_type FROM projects WHERE id=$1 AND deleted_at IS NULL', [projectId]);
  if (!project.rowCount) throw Object.assign(new Error('Dự án không tồn tại hoặc đã bị xóa'), { status: 400 });
  if (workItemId) {
    const item = await db.query(
      `SELECT wi.id,wi.name,wi.execution_type,g.name group_name
       FROM work_items wi JOIN work_groups g ON g.id=wi.group_id
       WHERE wi.id=$1 AND wi.is_active=true AND g.is_active=true
         AND (
           NOT EXISTS(SELECT 1 FROM work_item_project_types all_types WHERE all_types.work_item_id=wi.id)
           OR EXISTS(SELECT 1 FROM work_item_project_types matching_type
             WHERE matching_type.work_item_id=wi.id AND matching_type.project_type=$2)
         )`,
      [workItemId, project.rows[0].project_type]
    );
    if (!item.rowCount) throw Object.assign(new Error('Công việc không phù hợp với Loại dự án đã chọn'), { status: 400 });
    return {
      workItemId: item.rows[0].id,
      taskType: item.rows[0].group_name,
      taskName: item.rows[0].name,
      defaultEstimatedHours: null,
      executionType: item.rows[0].execution_type,
    };
  }
  if (!taskType || !taskName) throw Object.assign(new Error('Cần chọn Công việc cho nhiệm vụ'), { status: 400 });
  await ensureActiveCatalog('TASK_TYPE', taskType, db);
  const normalized=`${taskType} ${taskName}`.toLowerCase();
  return { workItemId: null, taskType, taskName, defaultEstimatedHours: null,
    executionType:normalized.includes('giao hàng')?'DELIVERY':normalized.includes('lắp đặt')?'INSTALLATION':null };
}

function validateDateRange(startDate, endDate, label = 'Thời gian') {
  if (startDate && endDate && startDate > endDate) {
    throw Object.assign(new Error(`${label}: ngày bắt đầu không được sau ngày kết thúc`), { status: 400 });
  }
}

const DAILY_PLANNED_HOURS = 8;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toISODate(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value ? String(value).slice(0, 10) : null;
}

function enumerateDates(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const normalizedStart = toISODate(startDate);
  const normalizedEnd = toISODate(endDate);
  validateDateRange(normalizedStart, normalizedEnd, 'Lịch phân công');
  const dates = [];
  const cursor = new Date(`${normalizedStart}T00:00:00Z`);
  const last = new Date(`${normalizedEnd}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function normalizeAssignmentSchedule(row, task = {}) {
  const suppliedDates = Array.isArray(row?.work_dates) ? row.work_dates : null;
  const dates = suppliedDates === null
    ? enumerateDates(row?.start_date || task.start_date, row?.end_date || task.end_date)
    : suppliedDates;
  const workDates = [...new Set(dates.map(toISODate))].sort();
  if (!workDates.length || workDates.some(value => !ISO_DATE_PATTERN.test(value))) {
    throw Object.assign(new Error('Cần chọn ít nhất một ngày làm việc hợp lệ trên lịch phân công'), { status:400 });
  }
  return {
    workDates,
    startDate: workDates[0],
    endDate: workDates[workDates.length - 1],
    plannedHours: workDates.length * DAILY_PLANNED_HOURS,
  };
}

async function replaceAssignmentWorkDays(db, assignmentId, workDates) {
  await db.query('DELETE FROM task_assignment_work_days WHERE task_assignment_id=$1', [assignmentId]);
  await db.query(
    `INSERT INTO task_assignment_work_days(task_assignment_id,work_date,planned_hours)
     SELECT $1,day::date,$3 FROM unnest($2::text[]) day`,
    [assignmentId,workDates,DAILY_PLANNED_HOURS]
  );
}

async function refreshTaskPlan(db, taskId) {
  await db.query('SELECT refresh_task_assignment_plan($1)', [taskId]);
  const refreshed = await db.query('SELECT * FROM tasks WHERE id=$1', [taskId]);
  return refreshed.rows[0];
}

async function validateProductionStage(db,projectId,stageId){
  if(!stageId)return null;
  const result=await db.query(`SELECT stage.*,production.production_code,production.group_name,production.status production_status,
    plan.status plan_status FROM production_stage_instances stage
    JOIN production_orders production ON production.id=stage.production_order_id
    LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
    WHERE stage.id=$1 AND production.project_id=$2`,[stageId,projectId]);
  if(!result.rowCount)throw Object.assign(new Error('Công đoạn không thuộc Dự án đã chọn'),{status:400});
  if(result.rows[0].production_status==='CANCELLED'||result.rows[0].plan_status==='CANCELLED')throw Object.assign(new Error('Không thể gán Công việc vào Công đoạn đã hủy'),{status:409});
  if(result.rows[0].production_status==='COMPLETED')throw Object.assign(new Error('Không thể gán Công việc vào Nhóm sản xuất đã hoàn tất'),{status:409});
  return result.rows[0];
}

async function normalizeTaskSource(db,{projectId,stageId,sourceType,orderId,fulfillmentItems,executionType}){
  const normalizedSource=sourceType||(stageId?'PRODUCTION_STAGE':'PROJECT_DIRECT');
  if(!['PRODUCTION_STAGE','PROJECT_DIRECT','ORDER_FULFILLMENT'].includes(normalizedSource)){
    throw Object.assign(new Error('Nguồn nhiệm vụ không hợp lệ'),{status:400});
  }
  if(normalizedSource==='PRODUCTION_STAGE'){
    if(!stageId)throw Object.assign(new Error('Công việc sản xuất phải thuộc một Công đoạn'),{status:400});
    await validateProductionStage(db,projectId,stageId);
    return {sourceType:normalizedSource,stageId:Number(stageId),orderId:null,fulfillmentItems:[]};
  }
  if(stageId)throw Object.assign(new Error('Nhiệm vụ trực tiếp không được gắn vào Công đoạn sản xuất'),{status:400});
  if(normalizedSource==='PROJECT_DIRECT'){
    return {sourceType:normalizedSource,stageId:null,orderId:null,fulfillmentItems:[]};
  }
  if(!['DELIVERY','INSTALLATION'].includes(executionType)){
    throw Object.assign(new Error('Thực thi Đơn hàng chỉ áp dụng cho Công việc Giao hàng hoặc Lắp đặt'),{status:400});
  }
  const normalizedOrderId=Number(orderId);
  if(!Number.isInteger(normalizedOrderId))throw Object.assign(new Error('Cần chọn Đơn hàng cần giao hoặc lắp đặt'),{status:400});
  const order=await db.query(
    `SELECT id FROM project_orders
     WHERE id=$1 AND project_id=$2 AND status<>'CANCELLED'`,
    [normalizedOrderId,projectId]
  );
  if(!order.rowCount)throw Object.assign(new Error('Đơn hàng không thuộc Dự án hoặc đã bị hủy'),{status:400});
  const rows=Array.isArray(fulfillmentItems)?fulfillmentItems:[];
  const itemIds=rows.map(row=>Number(row.order_item_id));
  if(!rows.length||itemIds.some(id=>!Number.isInteger(id))||new Set(itemIds).size!==itemIds.length){
    throw Object.assign(new Error('Cần chọn ít nhất một hạng mục Đơn hàng với số lượng hợp lệ'),{status:400});
  }
  const orderItems=await db.query(
    `SELECT id,item_name,unit,quantity FROM project_order_items
     WHERE order_id=$1 AND id=ANY($2::bigint[]) FOR UPDATE`,
    [normalizedOrderId,itemIds]
  );
  if(orderItems.rowCount!==itemIds.length)throw Object.assign(new Error('Có hạng mục không thuộc Đơn hàng đã chọn'),{status:400});
  const byId=new Map(orderItems.rows.map(item=>[Number(item.id),item]));
  const normalizedItems=[];
  for(const row of rows){
    const item=byId.get(Number(row.order_item_id));
    const plannedQuantity=Number(row.planned_quantity);
    if(!(plannedQuantity>0))throw Object.assign(new Error(`${item.item_name}: số lượng phải lớn hơn 0`),{status:400});
    const allocation=await db.query(
      `SELECT COALESCE(SUM(link.planned_quantity),0) allocated
       FROM task_order_fulfillment_items link
       JOIN tasks task ON task.id=link.task_id
       WHERE link.order_item_id=$1 AND link.execution_type=$2
         AND task.deleted_at IS NULL AND task.status NOT IN ('Hủy','Lưu trữ')`,
      [item.id,executionType]
    );
    const remaining=Number(item.quantity)-Number(allocation.rows[0].allocated);
    if(plannedQuantity>remaining){
      throw Object.assign(new Error(`${item.item_name}: chỉ còn ${remaining} ${item.unit} chưa được lập nhiệm vụ ${executionType==='DELIVERY'?'Giao hàng':'Lắp đặt'}`),{status:409});
    }
    normalizedItems.push({orderItemId:item.id,plannedQuantity});
  }
  return {sourceType:normalizedSource,stageId:null,orderId:normalizedOrderId,fulfillmentItems:normalizedItems};
}

async function saveFulfillmentItems(db,taskId,executionType,items){
  for(const item of items){
    await db.query(
      `INSERT INTO task_order_fulfillment_items(task_id,order_item_id,execution_type,planned_quantity)
       VALUES($1,$2,$3,$4)`,
      [taskId,item.orderItemId,executionType,item.plannedQuantity]
    );
  }
}

async function refreshProductionStageFromWorks(db,stageId){
  if(!stageId)return;
  const summary=await db.query(`SELECT stage.id,stage.production_order_id,stage.tracks_quantity,
    COUNT(work.id) FILTER(WHERE work.deleted_at IS NULL)::int work_count,
    COUNT(work.id) FILTER(WHERE work.deleted_at IS NULL AND work.is_completed=true)::int completed_work_count,
    COUNT(work.id) FILTER(WHERE work.deleted_at IS NULL AND work.status NOT IN ('Chưa bắt đầu','Chờ xử lý'))::int started_work_count,
    NOT EXISTS(SELECT 1 FROM production_stage_items item WHERE item.stage_instance_id=stage.id AND item.good_quantity<item.planned_quantity) quantity_complete
    FROM production_stage_instances stage LEFT JOIN tasks work ON work.production_stage_instance_id=stage.id
    WHERE stage.id=$1 GROUP BY stage.id`,[stageId]);
  if(!summary.rowCount)return;
  const row=summary.rows[0];
  const completed=row.work_count>0&&row.completed_work_count===row.work_count&&(!row.tracks_quantity||row.quantity_complete);
  const status=completed?'COMPLETED':row.started_work_count>0?'IN_PROGRESS':'PLANNED';
  await db.query(`UPDATE production_stage_instances SET status=$1 WHERE id=$2`,[status,stageId]);
  const required=await db.query(`SELECT COUNT(*) FILTER(WHERE is_required)::int total,
    COUNT(*) FILTER(WHERE is_required AND status='COMPLETED')::int completed,
    COUNT(*) FILTER(WHERE status='IN_PROGRESS')::int in_progress FROM production_stage_instances WHERE production_order_id=$1`,[row.production_order_id]);
  const productionStatus=required.rows[0].total>0&&required.rows[0].total===required.rows[0].completed?'READY_FOR_DELIVERY':required.rows[0].in_progress>0?'IN_PROGRESS':'PLANNED';
  await db.query(`UPDATE production_orders SET status=$1 WHERE id=$2 AND status NOT IN ('COMPLETED','CANCELLED')`,[productionStatus,row.production_order_id]);
  await db.query(`UPDATE production_plans plan SET status=CASE
    WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status NOT IN ('READY_FOR_DELIVERY','COMPLETED','CANCELLED')) THEN 'READY_FOR_DELIVERY'
    WHEN EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status='IN_PROGRESS') THEN 'IN_PROGRESS'
    ELSE 'PLANNED' END
    WHERE plan.id=(SELECT production_plan_id FROM production_orders WHERE id=$1) AND plan.status NOT IN ('COMPLETED','CANCELLED')`,[row.production_order_id]);
}

async function saveInitialAssignments(db, task, assignments, userId) {
  const rows = Array.isArray(assignments) ? assignments : [];
  const employeeIds = rows.map(row => Number(row.employee_id));
  if (employeeIds.some(id => !Number.isInteger(id)) || new Set(employeeIds).size !== employeeIds.length) {
    throw Object.assign(new Error('Danh sách nhân viên phân công không hợp lệ hoặc bị trùng'), { status: 400 });
  }
  if (!employeeIds.length) return { warnings:[], syncedEmployees:[] };
  const activeEmployees = await db.query(
    `SELECT id,full_name FROM employees WHERE id=ANY($1::int[]) AND status='Hoạt động'`,
    [employeeIds]
  );
  if (activeEmployees.rowCount !== employeeIds.length) {
    throw Object.assign(new Error('Danh sách có nhân viên không tồn tại hoặc đã ngừng hoạt động'), { status:400 });
  }
  const current = await db.query(
    `SELECT DISTINCT ON(employee_id) employee_id,role FROM project_assignments
     WHERE project_id=$1 AND employee_id=ANY($2::int[]) ORDER BY employee_id,id`,
    [task.project_id,employeeIds]
  );
  const projectRoles = new Map(current.rows.map(item => [Number(item.employee_id),item.role]));
  const defaultRole = await db.query(
    `SELECT name FROM system_catalogs WHERE catalog_type='PROJECT_ROLE' AND is_active=true
     ORDER BY is_default DESC,sort_order,name LIMIT 1`
  );
  if (!defaultRole.rowCount) throw Object.assign(new Error('Chưa có Danh mục vai trò đang hoạt động'), { status:400 });

  const warnings = [];
  const syncedEmployees = [];
  for (const row of rows) {
    const employeeId = Number(row.employee_id);
    const projectRole = row.project_role || row.role_in_task || defaultRole.rows[0].name;
    if (!projectRoles.has(employeeId)) {
      await ensureActiveCatalog('PROJECT_ROLE', projectRole, db);
      await db.query(
        `INSERT INTO project_assignments(project_id,employee_id,role,notes)
         VALUES($1,$2,$3,$4)`,
        [task.project_id,employeeId,projectRole,'Tự động thêm khi phân công Task']
      );
      projectRoles.set(employeeId,projectRole);
      syncedEmployees.push(activeEmployees.rows.find(item => Number(item.id) === employeeId)?.full_name || String(employeeId));
    }
    const taskRole = row.role_in_task || projectRoles.get(employeeId) || projectRole;
    await ensureActiveCatalog('PROJECT_ROLE', taskRole, db);
    const schedule = normalizeAssignmentSchedule(row, task);
    const assignment = await db.query(
      `INSERT INTO task_assignments(task_id,employee_id,role_in_task,start_date,end_date,notes,assigned_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [task.id,employeeId,taskRole,schedule.startDate,schedule.endDate,row.notes || null,userId]
    );
    await replaceAssignmentWorkDays(db,assignment.rows[0].id,schedule.workDates);
    if (schedule.workDates.length) {
      const overlaps = await db.query(
        `SELECT DISTINCT t.task_code,t.task_name,p.project_name,e.full_name
         FROM task_assignments ta JOIN tasks t ON t.id=ta.task_id
         JOIN projects p ON p.id=t.project_id JOIN employees e ON e.id=ta.employee_id
         JOIN task_assignment_work_days existing_day ON existing_day.task_assignment_id=ta.id
         WHERE ta.employee_id=$1 AND ta.task_id<>$2 AND ta.is_active=true
           AND t.deleted_at IS NULL AND t.status NOT IN ('Hủy','Hoàn thành','Lưu trữ')
           AND existing_day.work_date=ANY($3::date[])`,
        [employeeId,task.id,schedule.workDates]
      );
      for (const overlap of overlaps.rows) {
        warnings.push(`${overlap.full_name} đang có “${overlap.task_name}” thuộc ${overlap.project_name} trong cùng thời gian`);
      }
    }
  }
  const refreshedTask = await refreshTaskPlan(db,task.id);
  return { warnings:[...new Set(warnings)], syncedEmployees, task:refreshedTask };
}

async function createAssignedTask(db,payload,userId){
  const {
    project_id,work_item_id,task_type,task_name,description,start_date,end_date,
    estimated_duration,estimated_hours,priority,notify_before_days,notes,assignments,
    production_stage_instance_id,task_source_type,order_id,fulfillment_items,
  }=payload;
  validateDateRange(start_date,end_date,'Nhiệm vụ');
  const definition=await resolveTaskDefinition(db,project_id,work_item_id,task_type,task_name);
  const source=await normalizeTaskSource(db,{
    projectId:project_id,stageId:production_stage_instance_id,sourceType:task_source_type,
    orderId:order_id,fulfillmentItems:fulfillment_items,executionType:definition.executionType,
  });
  const taskCode=await CodeGenerator.generateTaskCode(definition.taskType,db);
  const result=await db.query(`INSERT INTO tasks (
      task_code,project_id,work_item_id,task_type,task_name,execution_type,description,
      start_date,end_date,estimated_duration,estimated_hours,priority,notify_before_days,notes,
      created_by,production_stage_instance_id,task_source_type,order_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,[
    taskCode,project_id,definition.workItemId,definition.taskType,definition.taskName,definition.executionType,
    description,start_date,end_date,estimated_duration,estimated_hours??definition.defaultEstimatedHours,
    priority||'Trung bình',notify_before_days||1,notes,userId,source.stageId,source.sourceType,source.orderId,
  ]);
  await saveFulfillmentItems(db,result.rows[0].id,definition.executionType,source.fulfillmentItems);
  const assignmentResult=await saveInitialAssignments(db,result.rows[0],assignments,userId);
  await refreshProductionStageFromWorks(db,source.stageId);
  return {task:assignmentResult.task||result.rows[0],warnings:assignmentResult.warnings,syncedEmployees:assignmentResult.syncedEmployees};
}

// ==================== TASKS CRUD ====================

// GET all tasks with filters
// GET all tasks with filters (FIXED)
router.get('/', async (req, res, next) => {
  try {
    const {
      project_id,
      task_type,
      status,
      is_overdue,
      is_archived,
      employee_id,
      from_date,
      to_date,
    } = req.query;

    let query = `
      SELECT t.*, p.project_name, p.project_code, p.project_type, c.company_name,
        wi.name work_item_name,wg.id work_group_id,wg.name work_group_name,wg.color work_group_color,
        stage.stage_code,stage.stage_name,stage.sequence_no stage_sequence_no,
        production.id production_order_id,production.production_code,production.status production_status,
        production.planned_start_date production_start_date,production.planned_end_date production_end_date,
        production.group_name production_group_name,production.process_name,plan.plan_code,
        COALESCE(direct_order.id,orders.id) order_id,COALESCE(direct_order.order_code,orders.order_code) order_code,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',ta.id,'employee_id',e.id,'full_name',e.full_name,'position',e.position,
          'department',e.department,'role_in_task',ta.role_in_task,'start_date',ta.start_date,
          'end_date',ta.end_date,'notes',ta.notes,
          'work_dates',COALESCE((SELECT jsonb_agg(to_char(day.work_date,'YYYY-MM-DD') ORDER BY day.work_date)
            FROM task_assignment_work_days day WHERE day.task_assignment_id=ta.id),'[]'::jsonb),
          'planned_days',(SELECT count(*)::int FROM task_assignment_work_days day WHERE day.task_assignment_id=ta.id),
          'planned_hours',COALESCE((SELECT sum(day.planned_hours) FROM task_assignment_work_days day WHERE day.task_assignment_id=ta.id),0)
        ) ORDER BY e.full_name)
          FROM task_assignments ta JOIN employees e ON e.id=ta.employee_id
          WHERE ta.task_id=t.id AND ta.is_active=true),'[]'::jsonb) assignments,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',link.id,'order_item_id',source.id,'item_code',source.item_code,
          'item_name',source.item_name,'unit',source.unit,'order_quantity',source.quantity,
          'planned_quantity',link.planned_quantity,'completed_quantity',link.completed_quantity
        ) ORDER BY source.id)
          FROM task_order_fulfillment_items link
          JOIN project_order_items source ON source.id=link.order_item_id
          WHERE link.task_id=t.id),'[]'::jsonb) fulfillment_items
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN work_items wi ON wi.id=t.work_item_id
      LEFT JOIN work_groups wg ON wg.id=wi.group_id
      LEFT JOIN production_stage_instances stage ON stage.id=t.production_stage_instance_id
      LEFT JOIN production_orders production ON production.id=stage.production_order_id
      LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
      LEFT JOIN project_orders orders ON orders.id=production.order_id
      LEFT JOIN project_orders direct_order ON direct_order.id=t.order_id
      WHERE t.deleted_at IS NULL  
        AND p.deleted_at IS NULL
    `;
    
    const params = [];
    let paramIndex = 1;

    if (project_id) {
      query += ` AND t.project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }

    if (task_type) {
      query += ` AND t.task_type = $${paramIndex}`;
      params.push(task_type);
      paramIndex++;
    }

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (is_overdue === 'true') {
      query += ` AND t.is_overdue = TRUE`;
    }

    if (is_archived === 'true') {
      query += ` AND t.is_archived = TRUE`;
    } else {
      query += ` AND (t.is_archived = FALSE OR t.is_archived IS NULL)`;
    }

    if (employee_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM task_assignments ta 
        WHERE ta.task_id = t.id 
          AND ta.employee_id = $${paramIndex} 
          AND ta.is_active = TRUE
      )`;
      params.push(employee_id);
      paramIndex++;
    }

    if (req.query.production_stage_instance_id) {
      query += ` AND t.production_stage_instance_id = $${paramIndex}`;
      params.push(req.query.production_stage_instance_id);
      paramIndex++;
    }

    if (from_date || to_date) {
      const fromDate = from_date || '0001-01-01';
      const toDate = to_date || '9999-12-31';
      validateDateRange(fromDate,toDate,'Khoảng lọc');
      query += ` AND (
        EXISTS (
          SELECT 1 FROM task_assignments filtered_assignment
          JOIN task_assignment_work_days filtered_day ON filtered_day.task_assignment_id=filtered_assignment.id
          WHERE filtered_assignment.task_id=t.id AND filtered_assignment.is_active=true
            AND filtered_day.work_date BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date
        ) OR (
          NOT EXISTS (
            SELECT 1 FROM task_assignments dated_assignment
            JOIN task_assignment_work_days dated_day ON dated_day.task_assignment_id=dated_assignment.id
            WHERE dated_assignment.task_id=t.id AND dated_assignment.is_active=true
          )
          AND COALESCE(t.start_date,$${paramIndex}::date) <= $${paramIndex + 1}::date
          AND COALESCE(t.end_date,$${paramIndex + 1}::date) >= $${paramIndex}::date
        )
      )`;
      params.push(fromDate,toDate);
      paramIndex += 2;
    }

    query += ` ORDER BY COALESCE(t.start_date,stage.planned_start_date,production.planned_start_date,'9999-12-31'::date),
      production.created_at NULLS LAST,stage.sequence_no NULLS LAST,t.created_at,t.id`;

    const result = await pool.query(query, params);

    const stageParams=[];
    let stageFilter='';
    if(project_id){stageParams.push(project_id);stageFilter=' AND production.project_id=$1';}
    const productionStages=await pool.query(`SELECT stage.id,stage.sequence_no,stage.stage_code,stage.stage_name,
      stage.planned_start_date,stage.planned_end_date,stage.status,
      production.id production_order_id,production.production_code,production.group_name,production.process_name,
      production.status production_status,production.planned_start_date production_start_date,
      production.planned_end_date production_end_date,orders.id order_id,orders.order_code,
      project.id project_id,project.project_code,project.project_name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('order_item_id',source.id,'item_code',source.item_code,
        'item_name',source.item_name,'unit',source.unit,'planned_quantity',production_item.planned_quantity,
        'completed_quantity',COALESCE((SELECT stage_item.good_quantity
          FROM production_stage_items stage_item
          JOIN production_stage_instances completion_stage ON completion_stage.id=stage_item.stage_instance_id
          WHERE stage_item.production_order_item_id=production_item.id AND completion_stage.tracks_quantity=true
          ORDER BY completion_stage.sequence_no DESC,stage_item.id DESC LIMIT 1),0)) ORDER BY source.id)
        FROM production_order_items production_item
        JOIN project_order_items source ON source.id=production_item.order_item_id
        WHERE production_item.production_order_id=production.id),'[]'::jsonb) production_items
      FROM production_stage_instances stage
      JOIN production_orders production ON production.id=stage.production_order_id
      JOIN project_orders orders ON orders.id=production.order_id
      JOIN projects project ON project.id=production.project_id
      LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
      WHERE project.deleted_at IS NULL AND production.status<>'CANCELLED'
        AND COALESCE(plan.status,'PLANNED')<>'CANCELLED'${stageFilter}
      ORDER BY COALESCE(stage.planned_start_date,production.planned_start_date,'9999-12-31'::date),
        production.created_at,stage.sequence_no`,stageParams);

    const orderItemParams=[];
    let orderItemFilter='';
    if(project_id){orderItemParams.push(project_id);orderItemFilter=' AND orders.project_id=$1';}
    const orderItems=await pool.query(`SELECT orders.id order_id,orders.order_code,orders.status order_status,
      orders.project_id,source.id order_item_id,source.item_code,source.item_name,source.unit,
      source.quantity order_quantity,
      COALESCE((SELECT SUM(production_item.planned_quantity)
        FROM production_order_items production_item
        JOIN production_orders production ON production.id=production_item.production_order_id
        LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
        WHERE production_item.order_item_id=source.id AND production.status<>'CANCELLED'
          AND COALESCE(plan.status,'PLANNED')<>'CANCELLED'),0) allocated_quantity,
      COALESCE((SELECT SUM(COALESCE((SELECT stage_item.good_quantity
          FROM production_stage_items stage_item
          JOIN production_stage_instances completion_stage ON completion_stage.id=stage_item.stage_instance_id
          WHERE stage_item.production_order_item_id=production_item.id AND completion_stage.tracks_quantity=true
          ORDER BY completion_stage.sequence_no DESC,stage_item.id DESC LIMIT 1),0))
        FROM production_order_items production_item
        JOIN production_orders production ON production.id=production_item.production_order_id
        LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
        WHERE production_item.order_item_id=source.id AND production.status<>'CANCELLED'
          AND COALESCE(plan.status,'PLANNED')<>'CANCELLED'),0) completed_quantity
      FROM project_orders orders
      JOIN project_order_items source ON source.order_id=orders.id
      JOIN projects project ON project.id=orders.project_id
      WHERE project.deleted_at IS NULL${orderItemFilter}
        AND EXISTS(SELECT 1 FROM production_orders production
          LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
          WHERE production.order_id=orders.id AND production.status<>'CANCELLED'
            AND COALESCE(plan.status,'PLANNED')<>'CANCELLED')
      ORDER BY orders.created_at,orders.id,source.id`,orderItemParams);

    res.json({
      success: true,
      data: result.rows,
      production_stages: productionStages.rows,
      order_items: orderItems.rows,
    });
  } catch (error) {
    console.error('Error in GET /tasks:', error);
    next(error);
  }
});

// GET single task with full details
router.get('/:id', async (req, res, next) => {
  try {
    // Task basic info
    const taskResult = await pool.query(
      `SELECT t.*, p.project_name, p.project_code,p.project_type,c.company_name,
        wi.name work_item_name,wg.id work_group_id,wg.name work_group_name,wg.color work_group_color,
        stage.stage_code,stage.stage_name,stage.sequence_no stage_sequence_no,production.production_code,
        production.group_name production_group_name,production.process_name,plan.plan_code,
        COALESCE(direct_order.order_code,production_order.order_code) order_code
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN work_items wi ON wi.id=t.work_item_id
       LEFT JOIN work_groups wg ON wg.id=wi.group_id
       LEFT JOIN production_stage_instances stage ON stage.id=t.production_stage_instance_id
       LEFT JOIN production_orders production ON production.id=stage.production_order_id
       LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
       LEFT JOIN project_orders production_order ON production_order.id=production.order_id
       LEFT JOIN project_orders direct_order ON direct_order.id=t.order_id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    const task = taskResult.rows[0];

    // Get locations
    const locations = await pool.query(
      'SELECT * FROM task_locations WHERE task_id = $1 ORDER BY display_order, installation_date',
      [req.params.id]
    );

    // Get assigned employees
    const assignments = await pool.query(
      `SELECT ta.*, e.full_name, e.phone, e.position, e.department,
        COALESCE(day_plan.work_dates,'[]'::jsonb) work_dates,
        COALESCE(day_plan.planned_days,0) planned_days,
        COALESCE(day_plan.planned_hours,0) planned_hours
       FROM task_assignments ta
       JOIN employees e ON ta.employee_id = e.id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(to_char(day.work_date,'YYYY-MM-DD') ORDER BY day.work_date) work_dates,
           count(*)::int planned_days,sum(day.planned_hours)::numeric(10,2) planned_hours
         FROM task_assignment_work_days day WHERE day.task_assignment_id=ta.id
       ) day_plan ON true
       WHERE ta.task_id = $1 AND ta.is_active = TRUE`,
      [req.params.id]
    );

    // Get reports
    const reports = await pool.query(
      `SELECT tr.*, e.full_name as employee_name, tl.location_name
       FROM task_reports tr
       JOIN employees e ON tr.employee_id = e.id
       LEFT JOIN task_locations tl ON tr.task_location_id = tl.id
       WHERE tr.task_id = $1
       ORDER BY tr.report_date DESC
       LIMIT 20`,
      [req.params.id]
    );

    const fulfillmentItems = await pool.query(
      `SELECT link.*,source.item_code,source.item_name,source.unit,source.quantity order_quantity
       FROM task_order_fulfillment_items link
       JOIN project_order_items source ON source.id=link.order_item_id
       WHERE link.task_id=$1 ORDER BY source.id`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...task,
        locations: locations.rows,
        assignments: assignments.rows,
        reports: reports.rows,
        fulfillment_items: fulfillmentItems.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST create new task
router.post('/batch',validateTask,async(req,res,next)=>{
  const errors=validationResult(req);
  if(!errors.isEmpty())return res.status(400).json({success:false,errors:errors.array()});
  const workItemIds=[...new Set((req.body.work_item_ids||[]).map(Number).filter(Number.isInteger))];
  if(!workItemIds.length||workItemIds.length>10)return res.status(400).json({success:false,message:'Chọn từ 1 đến 10 Công việc'});
  if(req.body.task_source_type==='ORDER_FULFILLMENT'&&workItemIds.length!==1){
    return res.status(400).json({success:false,message:'Mỗi nhiệm vụ Giao hàng/Lắp đặt chỉ chọn một Công việc hệ thống'});
  }
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const created=[];const warnings=[];const synced=[];
    for(const workItemId of workItemIds){
      const result=await createAssignedTask(client,{...req.body,work_item_id:workItemId},req.user?.id||1);
      created.push(result.task);warnings.push(...result.warnings);synced.push(...result.syncedEmployees);
    }
    await client.query('COMMIT');
    res.status(201).json({success:true,message:`Đã tạo và phân công ${created.length} Công việc`,data:created,
      warnings:[...new Set(warnings)],synced_project_employees:[...new Set(synced)]});
  }catch(error){await client.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}
  finally{client.release();}
});

router.post('/', validateTask, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const created=await createAssignedTask(client,req.body,req.user?.id||1);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Tạo nhiệm vụ thành công',
      data: created.task,
      warnings: created.warnings,
      synced_project_employees: created.syncedEmployees,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ success:false, message:error.message });
    next(error);
  } finally {
    client.release();
  }
});

// PUT update task
router.put('/:id', validateTask, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      project_id,
      work_item_id,
      task_type,
      task_name,
      description,
      status,
      progress,
      priority,
      notify_before_days,
      notes,
      production_stage_instance_id,
    } = req.body;

    const currentTask=await client.query(
      `SELECT project_id,production_stage_instance_id,task_source_type,order_id,execution_type
       FROM tasks WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    );
    if(!currentTask.rowCount)throw Object.assign(new Error('Không tìm thấy nhiệm vụ'),{status:404});
    const current=currentTask.rows[0];
    const definition = await resolveTaskDefinition(client, project_id, work_item_id, task_type, task_name);
    let targetStageId=null;
    if(current.task_source_type==='PRODUCTION_STAGE'){
      targetStageId=production_stage_instance_id||current.production_stage_instance_id;
      await validateProductionStage(client,project_id,targetStageId);
    }
    if(current.task_source_type==='ORDER_FULFILLMENT'){
      if(Number(project_id)!==Number(current.project_id)){
        throw Object.assign(new Error('Không thể chuyển nhiệm vụ thực thi sang Dự án khác'),{status:409});
      }
      if(definition.executionType!==current.execution_type){
        throw Object.assign(new Error('Không thể đổi loại Giao hàng/Lắp đặt sau khi đã phân bổ hạng mục'),{status:409});
      }
    }
    const result = await client.query(
      `UPDATE tasks SET
        project_id = $1,
        work_item_id = $2,
        task_type = $3,
        task_name = $4,
        execution_type = $5,
        description = $6,
        status = $7,
        progress = $8,
        priority = $9,
        notify_before_days = $10,
        notes = $11,
        production_stage_instance_id = $12,
        updated_at = NOW()
      WHERE id = $13
      RETURNING *`,
      [
        project_id,
        definition.workItemId,
        definition.taskType,
        definition.taskName,
        definition.executionType,
        description,
        status || 'Chưa bắt đầu',
        progress ?? 0,
        priority || 'Trung bình',
        notify_before_days ?? 1,
        notes,
        targetStageId,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    await refreshProductionStageFromWorks(client,current.production_stage_instance_id);
    if(Number(current.production_stage_instance_id)!==Number(targetStageId))await refreshProductionStageFromWorks(client,targetStageId);

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Cập nhật nhiệm vụ thành công',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ success:false, message:error.message });
    next(error);
  } finally { client.release(); }
});

// PATCH complete task
router.patch('/:id/complete', async (req, res, next) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const executionCheck=await client.query(`SELECT t.execution_type,
      COUNT(location.id)::int total_locations,COUNT(location.id) FILTER(WHERE location.is_completed=true)::int completed_locations
      FROM tasks t LEFT JOIN task_locations location ON location.task_id=t.id WHERE t.id=$1 GROUP BY t.id`,[req.params.id]);
    if(executionCheck.rowCount&&executionCheck.rows[0].execution_type){
      const check=executionCheck.rows[0];
      if(!check.total_locations||check.completed_locations!==check.total_locations){
        await client.query('ROLLBACK');
        return res.status(409).json({success:false,message:check.total_locations
          ?`Còn ${check.total_locations-check.completed_locations} địa điểm chưa hoàn thành. Người quản lý chưa thể duyệt hoàn thành Task.`
          :'Công việc Giao hàng/Lắp đặt chưa có danh sách địa điểm.'});
      }
    }

    const result = await client.query(
      `UPDATE tasks SET
        status = 'Hoàn thành',
        progress = 100,
        is_completed = TRUE,
        completed_at = NOW(),
        completed_by = $1,
        actual_end_date = CURRENT_DATE,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [req.user?.id || 1, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }
    await client.query(
      `UPDATE task_order_fulfillment_items
       SET completed_quantity=planned_quantity,updated_at=NOW()
       WHERE task_id=$1`,
      [req.params.id]
    );
    await refreshProductionStageFromWorks(client,result.rows[0].production_stage_instance_id);

    // Create notification
    await client.query(
      `INSERT INTO task_notifications (
        task_id, notification_type, title, message, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        req.params.id,
        'Hoàn thành',
        'Nhiệm vụ đã hoàn thành',
        `Nhiệm vụ "${result.rows[0].task_name}" đã được đánh dấu hoàn thành`,
        'Normal',
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Đánh dấu hoàn thành thành công',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH archive task
router.patch('/:id/archive', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE tasks SET
        is_archived = TRUE,
        archived_at = NOW(),
        archived_by = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [req.user?.id || 1, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    res.json({
      success: true,
      message: 'Lưu trữ nhiệm vụ thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE task
// DELETE task (Soft Delete)
router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check if task exists and not deleted
    const checkResult = await client.query(
      'SELECT id, task_name, task_code, status, deleted_at, production_stage_instance_id FROM tasks WHERE id = $1',
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (task.deleted_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được xóa trước đó'
      });
    }
    
    // Soft delete task
    const result = await client.query(
      `UPDATE tasks 
       SET deleted_at = NOW(), 
           deleted_by = $1,
           status = 'Hủy',
           updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [userId, taskId]
    );
    await client.query(`DELETE FROM shopfloor_work_board_items item USING shopfloor_work_boards board
      WHERE item.board_id=board.id AND item.task_id=$1 AND item.source_type='TASK_ASSIGNMENT'
        AND board.status NOT IN ('LOCKED','CLOSED')`,[taskId]);
    
    // Count deactivated assignments (trigger sẽ tự động làm)
    const countResult = await client.query(
      `SELECT COUNT(*) as count 
       FROM task_assignments 
       WHERE task_id = $1 AND is_active = FALSE`,
      [taskId]
    );
    await refreshProductionStageFromWorks(client,task.production_stage_instance_id);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: task.production_stage_instance_id
        ? `Đã xóa Công việc "${task.task_name}" khỏi Công đoạn; Công đoạn và phân bổ Đơn hàng được giữ nguyên.`
        : `Xóa nhiệm vụ "${task.task_name}" thành công. Đã giải phóng ${countResult.rows[0].count} nhân viên.`,
      data: {
        task: result.rows[0],
        freed_employees_count: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ==================== TASK LOCATIONS ====================

// POST add location manually
router.post('/:id/locations', async (req, res, next) => {
  try {
    const {
      location_name,
      location_address,
      location_city,
      location_district,
      contact_person,
      contact_phone,
      installation_date,
      installation_time_start,
      installation_time_end,
      estimated_hours,
      product_info,
      work_description,
      notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO task_locations (
        task_id, location_name, location_address, location_city, location_district,
        contact_person, contact_phone, installation_date,
        installation_time_start, installation_time_end, estimated_hours,
        product_info, work_description, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        req.params.id,
        location_name,
        location_address,
        location_city,
        location_district,
        contact_person,
        contact_phone,
        installation_date,
        installation_time_start,
        installation_time_end,
        estimated_hours,
        product_info,
        work_description,
        notes,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thêm địa điểm thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// POST import locations from CSV
router.post('/:id/locations/import', upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng upload file CSV',
      });
    }

    await client.query('BEGIN');

    const locations = [];
    const errors = [];

    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          // Validate required fields
          if (!row.location_name || !row.location_address) {
            errors.push({
              row,
              message: 'Thiếu tên hoặc địa chỉ địa điểm',
            });
            return;
          }

          locations.push({
            location_name: row.location_name,
            location_address: row.location_address,
            location_city: row.location_city || '',
            location_district: row.location_district || '',
            contact_person: row.contact_person || '',
            contact_phone: row.contact_phone || '',
            installation_date: row.installation_date || null,
            installation_time_start: row.installation_time_start || null,
            installation_time_end: row.installation_time_end || null,
            estimated_hours: parseFloat(row.estimated_hours) || 0,
            product_info: row.product_info || '',
            work_description: row.work_description || '',
            notes: row.notes || '',
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Delete uploaded file
    fs.unlinkSync(req.file.path);

    if (locations.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'File CSV không có dữ liệu hợp lệ',
        errors,
      });
    }

    // Insert locations
    const insertedLocations = [];
    for (const loc of locations) {
      const result = await client.query(
        `INSERT INTO task_locations (
          task_id, location_name, location_address, location_city, location_district,
          contact_person, contact_phone, installation_date,
          installation_time_start, installation_time_end, estimated_hours,
          product_info, work_description, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          req.params.id,
          loc.location_name,
          loc.location_address,
          loc.location_city,
          loc.location_district,
          loc.contact_person,
          loc.contact_phone,
          loc.installation_date,
          loc.installation_time_start,
          loc.installation_time_end,
          loc.estimated_hours,
          loc.product_info,
          loc.work_description,
          loc.notes,
        ]
      );
      insertedLocations.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Import thành công ${insertedLocations.length} địa điểm`,
      data: insertedLocations,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  } finally {
    client.release();
  }
});



// POST import locations from Excel (.xlsx)
router.post('/:id/locations/import-excel', upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng upload file Excel .xlsx' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ success: false, message: 'File Excel không có worksheet' });
    const headers = {};
    sheet.getRow(1).eachCell((cell, col) => { headers[String(cell.value || '').trim()] = col; });
    const required = ['location_name', 'location_address'];
    for (const h of required) if (!headers[h]) return res.status(400).json({ success: false, message: `Thiếu cột ${h}` });
    const fields = ['location_name','location_address','location_city','location_district','contact_person','contact_phone','installation_date','installation_time_start','installation_time_end','estimated_hours','product_info','work_description','notes'];
    const rows = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const item = {};
      for (const f of fields) item[f] = headers[f] ? row.getCell(headers[f]).value : null;
      if (item.location_name && item.location_address) rows.push(item);
    });
    if (!rows.length) return res.status(400).json({ success: false, message: 'File Excel không có dữ liệu hợp lệ' });
    await client.query('BEGIN');
    const inserted = [];
    for (const loc of rows) {
      const result = await client.query(`INSERT INTO task_locations (
        task_id, location_name, location_address, location_city, location_district,
        contact_person, contact_phone, installation_date, installation_time_start,
        installation_time_end, estimated_hours, product_info, work_description, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [
        req.params.id, loc.location_name, loc.location_address, loc.location_city || '', loc.location_district || '',
        loc.contact_person || '', loc.contact_phone || '', loc.installation_date || null,
        loc.installation_time_start || null, loc.installation_time_end || null,
        Number(loc.estimated_hours) || 0, loc.product_info || '', loc.work_description || '', loc.notes || ''
      ]);
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Import thành công ${inserted.length} địa điểm từ Excel`, data: inserted });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    client.release();
  }
});

// GET export locations to Excel (.xlsx)
router.get('/:id/locations-export.xlsx', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT location_name, location_address, location_city, location_district,
      contact_person, contact_phone, installation_date, installation_time_start, installation_time_end,
      estimated_hours, actual_hours, status, progress, product_info, work_description, notes
      FROM task_locations WHERE task_id = $1 ORDER BY display_order, installation_date, id`, [req.params.id]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dia diem');
    sheet.columns = [
      'location_name','location_address','location_city','location_district','contact_person','contact_phone',
      'installation_date','installation_time_start','installation_time_end','estimated_hours','actual_hours',
      'status','progress','product_info','work_description','notes'
    ].map(key => ({ header: key, key, width: 20 }));
    result.rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="task-${req.params.id}-locations.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
});

// PUT update location
router.put('/:taskId/locations/:locationId', async (req, res, next) => {
  try {
    const {
      location_name,
      location_address,
      location_city,
      location_district,
      contact_person,
      contact_phone,
      installation_date,
      installation_time_start,
      installation_time_end,
      estimated_hours,
      actual_hours,
      status,
      progress,
      product_info,
      work_description,
      notes,
      issues,
    } = req.body;

    const result = await pool.query(
      `UPDATE task_locations SET
        location_name = $1,
        location_address = $2,
        location_city = $3,
        location_district = $4,
        contact_person = $5,
        contact_phone = $6,
        installation_date = $7,
        installation_time_start = $8,
        installation_time_end = $9,
        estimated_hours = $10,
        actual_hours = $11,
        status = $12,
        progress = $13,
        product_info = $14,
        work_description = $15,
        notes = $16,
        issues = $17,
        updated_at = NOW()
      WHERE id = $18 AND task_id = $19
      RETURNING *`,
      [
        location_name,
        location_address,
        location_city,
        location_district,
        contact_person,
        contact_phone,
        installation_date,
        installation_time_start,
        installation_time_end,
        estimated_hours,
        actual_hours,
        status,
        progress,
        product_info,
        work_description,
        notes,
        issues,
        req.params.locationId,
        req.params.taskId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật địa điểm thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// PATCH complete location
router.patch('/:taskId/locations/:locationId/complete', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE task_locations SET
        status = 'Hoàn thành',
        progress = 100,
        is_completed = TRUE,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND task_id = $2
      RETURNING *`,
      [req.params.locationId, req.params.taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    res.json({
      success: true,
      message: 'Đánh dấu hoàn thành địa điểm',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE location
router.delete('/:taskId/locations/:locationId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM task_locations WHERE id = $1 AND task_id = $2 RETURNING *',
      [req.params.locationId, req.params.taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    res.json({
      success: true,
      message: 'Xóa địa điểm thành công',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== TASK ASSIGNMENTS ====================

// POST assign employee to task
router.post('/:id/assignments', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { employee_id, role_in_task, project_role, notes } = req.body;
    await client.query('BEGIN');
    const task = await client.query('SELECT id,project_id,start_date,end_date FROM tasks WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!task.rowCount) throw Object.assign(new Error('Không tìm thấy Task'), { status:404 });
    const schedule = normalizeAssignmentSchedule(req.body,task.rows[0]);
    const employee = await client.query(`SELECT full_name FROM employees WHERE id=$1 AND status='Hoạt động'`, [employee_id]);
    if (!employee.rowCount) throw Object.assign(new Error('Nhân viên không hợp lệ hoặc đã ngừng hoạt động'), { status:400 });
    const existingProjectAssignment = await client.query(
      'SELECT role FROM project_assignments WHERE project_id=$1 AND employee_id=$2 ORDER BY id LIMIT 1',
      [task.rows[0].project_id,employee_id]
    );
    let syncedToProject = false;
    const selectedProjectRole = project_role || role_in_task;
    if (!existingProjectAssignment.rowCount) {
      await ensureActiveCatalog('PROJECT_ROLE',selectedProjectRole,client);
      await client.query(
        `INSERT INTO project_assignments(project_id,employee_id,role,notes)
         VALUES($1,$2,$3,$4)`,
        [task.rows[0].project_id,employee_id,selectedProjectRole,'Tự động thêm khi phân công Task']
      );
      syncedToProject = true;
    }
    const selectedTaskRole = role_in_task || existingProjectAssignment.rows[0]?.role || selectedProjectRole;
    await ensureActiveCatalog('PROJECT_ROLE',selectedTaskRole,client);
    const result = await client.query(
      `INSERT INTO task_assignments (
        task_id, employee_id, role_in_task, start_date, end_date, notes, assigned_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (task_id, employee_id)
      DO UPDATE SET
        role_in_task = EXCLUDED.role_in_task,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        notes = EXCLUDED.notes,
        is_active = TRUE
      RETURNING *`,
      [
        req.params.id,
        employee_id,
        selectedTaskRole,
        schedule.startDate,
        schedule.endDate,
        notes,
        req.user?.id || 1,
      ]
    );
    await replaceAssignmentWorkDays(client,result.rows[0].id,schedule.workDates);
    const refreshedTask = await refreshTaskPlan(client,req.params.id);
    const overlaps = await client.query(
      `SELECT DISTINCT t.task_code,t.task_name,p.project_name
       FROM task_assignments assignment
       JOIN task_assignment_work_days day ON day.task_assignment_id=assignment.id
       JOIN tasks t ON t.id=assignment.task_id
       JOIN projects p ON p.id=t.project_id
       WHERE assignment.employee_id=$1 AND assignment.id<>$2 AND assignment.is_active=true
         AND t.deleted_at IS NULL AND t.status NOT IN ('Hủy','Hoàn thành','Lưu trữ')
         AND day.work_date=ANY($3::date[])`,
      [employee_id,result.rows[0].id,schedule.workDates]
    );
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: syncedToProject ? 'Phân công thành công và đã thêm nhân viên vào dự án' : 'Phân công nhân viên thành công',
      data: {
        ...result.rows[0],
        work_dates:schedule.workDates,
        planned_days:schedule.workDates.length,
        planned_hours:schedule.plannedHours,
      },
      task_plan: refreshedTask,
      warnings:overlaps.rows.map(item=>`Trùng lịch với “${item.task_name}” thuộc ${item.project_name}`),
      synced_to_project: syncedToProject,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ success:false, message:error.message });
    next(error);
  } finally { client.release(); }
});

// DELETE remove employee from task
router.delete('/:taskId/assignments/:assignmentId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE task_assignments SET is_active = FALSE
       WHERE id = $1 AND task_id = $2
       RETURNING *`,
      [req.params.assignmentId, req.params.taskId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phân công',
      });
    }

    const taskPlan = await refreshTaskPlan(client,req.params.taskId);
    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Xóa phân công thành công',
      task_plan:taskPlan,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

// ==================== TASK NOTIFICATIONS ====================

// GET unread notifications
router.get('/notifications/unread', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT tn.*, t.task_name, t.task_code, p.project_name
       FROM task_notifications tn
       JOIN tasks t ON tn.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE tn.is_read = FALSE
       ORDER BY tn.created_at DESC
       LIMIT 50`
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH mark notification as read
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE task_notifications SET
        is_read = TRUE,
        read_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});
// ==================== TASK REPORT STATISTICS ====================

// GET task report statistics (for chart)
router.get('/:id/report-statistics', async (req, res, next) => {
  try {
    const { from_date, to_date, status } = req.query;
    const taskId = req.params.id;

    // Build query for daily statistics
    let query = `
      WITH date_series AS (
        SELECT generate_series(
          COALESCE($2::date, (SELECT start_date FROM tasks WHERE id = $1)),
          COALESCE($3::date, (SELECT end_date FROM tasks WHERE id = $1)),
          '1 day'::interval
        )::date AS report_date
      ),
      location_stats AS (
        SELECT 
          DATE(installation_date) as report_date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'Hoàn thành') as completed,
          COUNT(*) FILTER (WHERE status = 'Đang lắp đặt') as in_progress,
          COUNT(*) FILTER (WHERE status = 'Chưa bắt đầu') as not_started
        FROM task_locations
        WHERE task_id = $1
          AND installation_date IS NOT NULL
        GROUP BY DATE(installation_date)
      )
      SELECT 
        ds.report_date,
        COALESCE(ls.total, 0) as total,
        COALESCE(ls.completed, 0) as completed,
        COALESCE(ls.in_progress, 0) as in_progress,
        COALESCE(ls.not_started, 0) as not_started
      FROM date_series ds
      LEFT JOIN location_stats ls ON ds.report_date = ls.report_date
      ORDER BY ds.report_date
    `;

    const params = [taskId, from_date, to_date];
    const result = await pool.query(query, params);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_locations,
        COUNT(*) FILTER (WHERE is_completed = true) as completed_locations,
        COUNT(*) FILTER (WHERE status = 'Đang lắp đặt') as in_progress_locations,
        COUNT(*) FILTER (WHERE status = 'Chưa bắt đầu') as not_started_locations,
        SUM(estimated_hours) as total_estimated_hours,
        SUM(actual_hours) as total_actual_hours
      FROM task_locations
      WHERE task_id = $1
    `;

    const summaryResult = await pool.query(summaryQuery, [taskId]);

    res.json({
      success: true,
      data: {
        daily_stats: result.rows,
        summary: summaryResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET task locations report (for table and CSV export)
router.get('/:id/locations-report', async (req, res, next) => {
  try {
    const { from_date, to_date, status, sort_by = 'installation_date', sort_order = 'ASC' } = req.query;
    const taskId = req.params.id;

    let query = `
      SELECT 
        tl.id,
        tl.location_name,
        tl.location_address,
        tl.location_city,
        tl.location_district,
        tl.location_ward,
        tl.contact_person,
        tl.contact_phone,
        tl.installation_date,
        tl.installation_time_start,
        tl.installation_time_end,
        tl.estimated_hours,
        tl.actual_hours,
        tl.status,
        tl.progress,
        tl.product_info,
        tl.work_description,
        tl.notes,
        tl.issues,
        tl.is_completed,
        tl.completed_at,
        array_agg(
          DISTINCT jsonb_build_object(
            'employee_id', e.id,
            'employee_name', e.full_name,
            'role', tla.role
          )
        ) FILTER (WHERE e.id IS NOT NULL) as assigned_employees
      FROM task_locations tl
      LEFT JOIN task_location_assignments tla ON tl.id = tla.task_location_id
      LEFT JOIN employees e ON tla.employee_id = e.id
      WHERE tl.task_id = $1
    `;

    const params = [taskId];
    let paramIndex = 2;

    // Filter by date range
    if (from_date) {
      query += ` AND tl.installation_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND tl.installation_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    // Filter by status
    if (status && status !== 'all') {
      query += ` AND tl.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += `
      GROUP BY tl.id
    `;

    // Sorting
    const allowedSortFields = ['installation_date', 'status', 'progress', 'location_name'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'installation_date';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    query += ` ORDER BY tl.${sortField} ${sortDirection}`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});
// ==================== TASK PAUSE/RESUME/CANCEL ====================

// PATCH pause task
router.patch('/:id/pause', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { pause_reason } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check if task can be paused
    const checkResult = await client.query(
      `SELECT id, task_name, status FROM tasks WHERE id = $1`,
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (task.status === 'Hoàn thành') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Không thể tạm dừng nhiệm vụ đã hoàn thành'
      });
    }
    
    if (task.status === 'Tạm dừng') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được tạm dừng'
      });
    }
    
    // Pause task
    const result = await client.query(
      `UPDATE tasks 
       SET status = 'Tạm dừng',
           is_paused = TRUE,
           paused_at = NOW(),
           paused_by = $1,
           pause_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [userId, pause_reason, taskId]
    );
    
    // Deactivate all assignments (will be done by trigger)
    // But we'll do it explicitly for clarity
    await client.query(
      `UPDATE task_assignments 
       SET is_active = FALSE 
       WHERE task_id = $1`,
      [taskId]
    );
    
    // Create notification
    await client.query(
      `INSERT INTO task_notifications (
        task_id, notification_type, title, message, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        taskId,
        'Tạm dừng',
        'Nhiệm vụ đã tạm dừng',
        `Nhiệm vụ "${task.task_name}" đã được tạm dừng. Lý do: ${pause_reason || 'Không có'}`,
        'High'
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Tạm dừng nhiệm vụ thành công. Nhân viên đã được giải phóng.',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH resume task
router.patch('/:id/resume', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const taskId = req.params.id;
    
    // Check if task is paused
    const checkResult = await client.query(
      `SELECT id, task_name, status, is_paused FROM tasks WHERE id = $1`,
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (!task.is_paused || task.status !== 'Tạm dừng') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ không ở trạng thái tạm dừng'
      });
    }
    
    // Resume task
    const result = await client.query(
      `UPDATE tasks 
       SET status = 'Đang thực hiện',
           is_paused = FALSE,
           paused_at = NULL,
           paused_by = NULL,
           pause_reason = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [taskId]
    );
    
    // Reactivate all assignments
    await client.query(
      `UPDATE task_assignments 
       SET is_active = TRUE 
       WHERE task_id = $1`,
      [taskId]
    );
    
    // Create notification
    await client.query(
      `INSERT INTO task_notifications (
        task_id, notification_type, title, message, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        taskId,
        'Tiếp tục',
        'Nhiệm vụ đã tiếp tục',
        `Nhiệm vụ "${task.task_name}" đã được tiếp tục`,
        'Normal'
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Tiếp tục nhiệm vụ thành công. Nhân viên đã được gán lại.',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH cancel task
router.patch('/:id/cancel', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { cancel_reason } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check if task can be cancelled
    const checkResult = await client.query(
      `SELECT id, task_name, status FROM tasks WHERE id = $1`,
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (task.status === 'Hoàn thành') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Không thể hủy nhiệm vụ đã hoàn thành'
      });
    }
    
    if (task.status === 'Hủy') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được hủy'
      });
    }
    
    // Cancel task
    const result = await client.query(
      `UPDATE tasks 
       SET status = 'Hủy',
           cancelled_at = NOW(),
           cancelled_by = $1,
           cancel_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [userId, cancel_reason, taskId]
    );
    
    // Deactivate all assignments
    await client.query(
      `UPDATE task_assignments 
       SET is_active = FALSE 
       WHERE task_id = $1`,
      [taskId]
    );
    
    // Cancel all pending locations
    await client.query(
      `UPDATE task_locations 
       SET status = 'Hủy',
           notes = CONCAT(COALESCE(notes, ''), ' [Hủy: ', $1, ']')
       WHERE task_id = $2 
         AND status IN ('Chưa bắt đầu', 'Đang lắp đặt')`,
      [cancel_reason || 'Nhiệm vụ bị hủy', taskId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Hủy nhiệm vụ thành công. Nhân viên đã được giải phóng.',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// GET employee availability (updated to exclude paused/cancelled tasks)
router.get('/employees/availability', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT * FROM v_employee_active_workload
      ORDER BY full_name
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
