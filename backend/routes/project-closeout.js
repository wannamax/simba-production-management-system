const express=require('express');
const ExcelJS=require('exceljs');
const PdfPrinter=require('pdfmake');
const pdfVfs=require('pdfmake/build/vfs_fonts');
const pool=require('../config/database');

const router=express.Router();
const checklistTemplate=[
  ['PROJECT_INFO','Thông tin dự án và khách hàng đã đầy đủ'],
  ['TASKS_ACCEPTED','Công việc đã nghiệm thu đầy đủ'],
  ['WORK_REPORTS','Báo cáo công việc và giờ công đã hoàn tất'],
  ['MATERIALS_RECONCILED','Vật tư đã xuất, trả và đối soát'],
  ['COSTS_REVIEWED','Chi phí thực tế đã được rà soát'],
  ['CUSTOMER_ACCEPTANCE','Biên bản nghiệm thu khách hàng đã hoàn tất'],
  ['DOCUMENTS_ARCHIVED','Hồ sơ dự án đã được lưu trữ'],
];
const fail=(res,status,message,details)=>res.status(status).json({success:false,message,...(details?{details}:{})});
const num=value=>Number(value||0);
const money=value=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(num(value));
const date=value=>value?new Date(value).toLocaleDateString('vi-VN'):'-';

async function ensureChecklist(client,projectId){
  for(let index=0;index<checklistTemplate.length;index+=1){
    const [code,label]=checklistTemplate[index];
    await client.query(`INSERT INTO project_closeout_checklist_items(project_id,item_code,label,sort_order)
      VALUES($1,$2,$3,$4) ON CONFLICT(project_id,item_code) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order`,[projectId,code,label,(index+1)*10]);
  }
}

async function buildSnapshot(client,projectId){
  const projectResult=await client.query(`SELECT p.*,c.company_name,c.contact_person,c.phone customer_phone,
    COALESCE((SELECT SUM(a.actual_cost) FROM v_project_material_actuals a WHERE a.project_id=p.id),0) actual_material_cost
    FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.id=$1`,[projectId]);
  if(!projectResult.rowCount)throw Object.assign(new Error('Không tìm thấy dự án'),{status:404});
  await ensureChecklist(client,projectId);
  const [checklist,employees,hours,materials,tasks,schedules,blockerCounts]=await Promise.all([
    client.query('SELECT * FROM project_closeout_checklist_items WHERE project_id=$1 ORDER BY sort_order,id',[projectId]),
    client.query(`SELECT e.id,e.employee_code,e.full_name,e.department,e.position,
      string_agg(DISTINCT COALESCE(pa.role,'Thành viên'),', ') roles,
      COALESCE((SELECT SUM(x.work_hours) FROM (
        SELECT wr.work_hours FROM work_reports wr WHERE wr.project_id=$1 AND wr.employee_id=e.id
        UNION ALL SELECT tr.work_hours FROM task_reports tr JOIN tasks t ON t.id=tr.task_id WHERE t.project_id=$1 AND tr.employee_id=e.id
      ) x),0) total_work_hours
      FROM project_assignments pa JOIN employees e ON e.id=pa.employee_id WHERE pa.project_id=$1
      GROUP BY e.id,e.employee_code,e.full_name,e.department,e.position ORDER BY e.employee_code`,[projectId]),
    client.query(`SELECT source,report_date,employee_id,employee_code,employee_name,title,work_done,work_hours FROM (
      SELECT 'Báo cáo dự án' source,wr.report_date,wr.employee_id,e.employee_code,e.full_name employee_name,COALESCE(wr.title,wr.report_type) title,wr.work_done,COALESCE(wr.work_hours,0) work_hours
      FROM work_reports wr LEFT JOIN employees e ON e.id=wr.employee_id WHERE wr.project_id=$1
      UNION ALL
      SELECT 'Báo cáo nhiệm vụ',tr.report_date,tr.employee_id,e.employee_code,e.full_name,COALESCE(tr.report_title,t.task_name),tr.work_done,COALESCE(tr.work_hours,0)
      FROM task_reports tr JOIN tasks t ON t.id=tr.task_id LEFT JOIN employees e ON e.id=tr.employee_id WHERE t.project_id=$1
    ) h ORDER BY report_date,employee_code`,[projectId]),
    client.query(`SELECT r.id requirement_id,m.material_code,COALESCE(m.name,m.material_name) material_name,u.symbol unit_symbol,
      r.planned_quantity,COALESCE(a.net_issued_quantity,0) net_issued_quantity,r.estimated_unit_cost,
      (r.planned_quantity*r.estimated_unit_cost)::numeric(18,4) estimated_cost,COALESCE(a.actual_cost,0) actual_cost,r.status
      FROM project_material_requirements r JOIN materials m ON m.id=r.material_id JOIN material_units u ON u.id=r.base_unit_id
      LEFT JOIN v_project_material_actuals a ON a.requirement_id=r.id WHERE r.project_id=$1 AND r.status<>'CANCELLED' ORDER BY m.material_code`,[projectId]),
    client.query('SELECT id,task_code,task_name,task_type,status,progress,start_date,end_date,actual_hours FROM tasks WHERE project_id=$1 ORDER BY task_code',[projectId]),
    client.query('SELECT id,title,schedule_type,status,progress,start_datetime,end_datetime,actual_hours FROM schedules WHERE project_id=$1 ORDER BY start_datetime',[projectId]),
    client.query(`SELECT
      (SELECT COUNT(*) FROM tasks WHERE project_id=$1 AND COALESCE(is_archived,false)=false AND status NOT IN ('Hoàn thành','Hủy','Lưu trữ')) open_tasks,
      (SELECT COUNT(*) FROM schedules WHERE project_id=$1 AND status NOT IN ('Hoàn thành','Hủy')) open_schedules,
      (SELECT COUNT(*) FROM material_reservations WHERE project_id=$1 AND status NOT IN ('COMPLETED','RELEASED','CANCELLED')) open_reservations,
      (SELECT COUNT(*) FROM inventory_documents WHERE project_id=$1 AND status='DRAFT') draft_inventory_documents`,[projectId]),
  ]);
  const project=projectResult.rows[0];
  const totalWorkHours=hours.rows.reduce((sum,row)=>sum+num(row.work_hours),0);
  const totalMaterialCost=materials.rows.reduce((sum,row)=>sum+num(row.actual_cost),0);
  const baseActualCost=num(project.actual_cost);
  const totalActualCost=baseActualCost+totalMaterialCost;
  const blockers=blockerCounts.rows[0];
  const incompleteRequired=checklist.rows.filter(item=>item.is_required&&!item.is_completed).length;
  return {project,checklist:checklist.rows,employees:employees.rows,hours:hours.rows,materials:materials.rows,tasks:tasks.rows,schedules:schedules.rows,
    blockers:{...blockers,incomplete_required_checklist:incompleteRequired},summary:{total_employees:employees.rowCount,total_work_hours:totalWorkHours,total_material_cost:totalMaterialCost,base_actual_cost:baseActualCost,total_actual_cost:totalActualCost,budget:num(project.budget),budget_variance:num(project.budget)-totalActualCost}};
}

function canClose(snapshot){return Object.values(snapshot.blockers).every(value=>num(value)===0);}
async function loadSnapshot(client,projectId){
  const result=await client.query('SELECT * FROM project_closeout_snapshots WHERE project_id=$1 ORDER BY snapshot_version DESC LIMIT 1',[projectId]);
  return result.rows[0]||null;
}

router.get('/projects/:projectId',async(req,res,next)=>{const client=await pool.connect();try{const live=await buildSnapshot(client,Number(req.params.projectId));const snapshot=await loadSnapshot(client,Number(req.params.projectId));res.json({success:true,data:{...live,can_close:canClose(live),snapshot}});}catch(error){if(error.status)return fail(res,error.status,error.message);next(error);}finally{client.release();}});

router.put('/checklist/:id',async(req,res,next)=>{try{const completed=Boolean(req.body.is_completed);const result=await pool.query(`UPDATE project_closeout_checklist_items SET is_completed=$1,completed_at=CASE WHEN $1 THEN NOW() ELSE NULL END,notes=$2,updated_at=NOW() WHERE id=$3 RETURNING *`,[completed,req.body.notes||null,req.params.id]);if(!result.rowCount)return fail(res,404,'Không tìm thấy mục checklist');res.json({success:true,message:'Đã cập nhật checklist',data:result.rows[0]});}catch(error){next(error);}});

router.post('/projects/:projectId/close',async(req,res,next)=>{const client=await pool.connect();try{await client.query('BEGIN');const projectId=Number(req.params.projectId);const locked=await client.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE',[projectId]);if(!locked.rowCount)throw Object.assign(new Error('Không tìm thấy dự án'),{status:404});if(locked.rows[0].closeout_status==='CLOSED')throw Object.assign(new Error('Dự án đã được đóng'),{status:409});const snapshot=await buildSnapshot(client,projectId);if(!canClose(snapshot))throw Object.assign(new Error('Chưa thể đóng dự án vì checklist hoặc dữ liệu hệ thống chưa hoàn tất'),{status:409,details:snapshot.blockers});const closedAt=new Date().toISOString();snapshot.project={...snapshot.project,status:'Hoàn thành',closeout_status:'CLOSED',closed_at:closedAt,actual_end_date:snapshot.project.actual_end_date||closedAt.slice(0,10)};const version=await client.query('SELECT COALESCE(MAX(snapshot_version),0)+1 next FROM project_closeout_snapshots WHERE project_id=$1',[projectId]);const inserted=await client.query(`INSERT INTO project_closeout_snapshots(project_id,snapshot_version,snapshot_data,total_employees,total_work_hours,total_material_cost,total_actual_cost,closure_notes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[projectId,version.rows[0].next,JSON.stringify(snapshot),snapshot.summary.total_employees,snapshot.summary.total_work_hours,snapshot.summary.total_material_cost,snapshot.summary.total_actual_cost,req.body.closure_notes||null]);await client.query(`UPDATE projects SET closeout_status='CLOSED',closeout_snapshot_id=$1,closed_at=NOW(),actual_end_date=COALESCE(actual_end_date,CURRENT_DATE),status='Hoàn thành',closeout_notes=$2,updated_at=NOW() WHERE id=$3`,[inserted.rows[0].id,req.body.closure_notes||null,projectId]);await client.query('COMMIT');res.json({success:true,message:'Đã đóng dự án và tạo snapshot báo cáo',data:inserted.rows[0]});}catch(error){await client.query('ROLLBACK');if(error.status)return fail(res,error.status,error.message,error.details);next(error);}finally{client.release();}});

async function reportData(projectId){const client=await pool.connect();try{const stored=await loadSnapshot(client,projectId);return stored?stored.snapshot_data:buildSnapshot(client,projectId);}finally{client.release();}}

router.get('/projects/:projectId/export.xlsx',async(req,res,next)=>{try{const data=await reportData(Number(req.params.projectId));const workbook=new ExcelJS.Workbook();workbook.creator='Simba PMS';workbook.created=new Date();const addSheet=(name,columns,rows)=>{const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1,showGridLines:false}]});sheet.columns=columns;sheet.addRows(rows);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1677FF'}};sheet.getRow(1).alignment={vertical:'middle'};sheet.autoFilter={from:'A1',to:sheet.getRow(1).getCell(columns.length).address};sheet.columns.forEach(column=>{column.width=Math.min(Math.max(column.width||14,12),42);});return sheet;};
  const summary=workbook.addWorksheet('Tổng quan',{views:[{showGridLines:false}]});summary.mergeCells('A1:D1');summary.getCell('A1').value='SIMBA PMS - BÁO CÁO ĐÓNG DỰ ÁN';summary.getCell('A1').font={bold:true,size:18,color:{argb:'FFFFFFFF'}};summary.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F4C81'}};summary.getCell('A1').alignment={horizontal:'center'};summary.addRows([[],['Mã dự án',data.project.project_code,'Tên dự án',data.project.project_name],['Khách hàng',data.project.company_name||'-','Trạng thái',data.project.status],['Ngày bắt đầu',data.project.start_date||null,'Ngày kết thúc',data.project.actual_end_date||data.project.closed_at||null],[],['Nhân sự',data.summary.total_employees,'Tổng giờ công',data.summary.total_work_hours],['Chi phí vật tư',data.summary.total_material_cost,'Tổng chi phí thực tế',data.summary.total_actual_cost],['Ngân sách',data.summary.budget,'Chênh lệch ngân sách',data.summary.budget_variance]]);summary.columns=[{width:24},{width:24},{width:25},{width:35}];['B7','D7','B8','D8','B9','D9'].forEach(cell=>{summary.getCell(cell).numFmt='#,##0.00';});
  addSheet('Checklist',[{header:'Mã',key:'item_code',width:24},{header:'Nội dung',key:'label',width:42},{header:'Bắt buộc',key:'required',width:12},{header:'Hoàn tất',key:'completed',width:12},{header:'Ghi chú',key:'notes',width:35}],data.checklist.map(x=>({...x,required:x.is_required?'Có':'Không',completed:x.is_completed?'Có':'Không'})));
  addSheet('Nhân sự',[{header:'Mã NV',key:'employee_code',width:15},{header:'Họ tên',key:'full_name',width:28},{header:'Phòng ban',key:'department',width:20},{header:'Vị trí',key:'position',width:20},{header:'Vai trò',key:'roles',width:28},{header:'Giờ công',key:'total_work_hours',width:14}],data.employees);
  addSheet('Giờ công',[{header:'Ngày',key:'report_date',width:14},{header:'Nguồn',key:'source',width:20},{header:'Mã NV',key:'employee_code',width:14},{header:'Nhân viên',key:'employee_name',width:26},{header:'Tiêu đề',key:'title',width:32},{header:'Công việc',key:'work_done',width:42},{header:'Giờ',key:'work_hours',width:12}],data.hours);
  addSheet('Vật tư',[{header:'Mã vật tư',key:'material_code',width:16},{header:'Tên vật tư',key:'material_name',width:32},{header:'ĐVT',key:'unit_symbol',width:10},{header:'Dự trù',key:'planned_quantity',width:14},{header:'Thực xuất',key:'net_issued_quantity',width:14},{header:'Chi phí dự kiến',key:'estimated_cost',width:18},{header:'Chi phí thực tế',key:'actual_cost',width:18},{header:'Trạng thái',key:'status',width:20}],data.materials);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${data.project.project_code}-closeout.xlsx"`);await workbook.xlsx.write(res);res.end();}catch(error){next(error);}});

router.get('/projects/:projectId/export.pdf',async(req,res,next)=>{try{const data=await reportData(Number(req.params.projectId));const fonts={Roboto:{normal:Buffer.from(pdfVfs['Roboto-Regular.ttf'],'base64'),bold:Buffer.from(pdfVfs['Roboto-Medium.ttf'],'base64'),italics:Buffer.from(pdfVfs['Roboto-Italic.ttf'],'base64'),bolditalics:Buffer.from(pdfVfs['Roboto-MediumItalic.ttf'],'base64')}};const printer=new PdfPrinter(fonts);const table=(headers,rows,widths)=>({table:{headerRows:1,widths,body:[headers.map(text=>({text,bold:true,color:'white',fillColor:'#1677ff'})),...rows]},layout:'lightHorizontalLines',margin:[0,6,0,14]});const content=[{text:'BÁO CÁO ĐÓNG DỰ ÁN',style:'title'},{text:`${data.project.project_code} - ${data.project.project_name}`,style:'subtitle'},{text:`Khách hàng: ${data.project.company_name||'-'}   |   Ngày đóng: ${date(data.project.closed_at||new Date())}`,margin:[0,0,0,12]},table(['Chỉ tiêu','Giá trị'],[['Nhân sự',String(data.summary.total_employees)],['Tổng giờ công',String(data.summary.total_work_hours)],['Chi phí vật tư',`${money(data.summary.total_material_cost)} đ`],['Tổng chi phí thực tế',`${money(data.summary.total_actual_cost)} đ`],['Ngân sách còn lại',`${money(data.summary.budget_variance)} đ`]],['*',120]),{text:'Checklist đóng dự án',style:'section'},table(['Nội dung','Kết quả'],data.checklist.map(x=>[x.label,x.is_completed?'Hoàn tất':'Chưa hoàn tất']),['*',90]),{text:'Tổng hợp nhân sự',style:'section'},data.employees.length?table(['Mã NV','Họ tên','Vai trò','Giờ'],data.employees.map(x=>[x.employee_code,x.full_name,x.roles||'-',String(x.total_work_hours)]),[65,'*',110,42]):{text:'Chưa có nhân sự được phân công.',italics:true,color:'#64748b'}];if(data.hours.length)content.push({text:'Tổng hợp giờ công',style:'section'},table(['Ngày','Nhân viên','Nội dung','Giờ'],data.hours.map(x=>[date(x.report_date),x.employee_name||'-',x.work_done||x.title||'-',String(x.work_hours)]),[60,105,'*',38]));if(data.materials.length)content.push({text:'Tổng hợp vật tư',style:'section',pageBreak:'before'},table(['Mã','Vật tư','Dự trù','Thực xuất','Chi phí'],data.materials.map(x=>[x.material_code,x.material_name,`${num(x.planned_quantity)} ${x.unit_symbol}`,`${num(x.net_issued_quantity)} ${x.unit_symbol}`,money(x.actual_cost)]),[62,'*',62,62,70]));const doc={pageSize:'A4',pageMargins:[36,48,36,42],defaultStyle:{font:'Roboto',fontSize:9,color:'#1f2937'},footer:(current,total)=>({text:`Simba PMS - 2.6.0-D | Trang ${current}/${total}`,alignment:'center',fontSize:8,color:'#64748b'}),content,styles:{title:{fontSize:18,bold:true,color:'#0f4c81',alignment:'center'},subtitle:{fontSize:12,bold:true,alignment:'center',margin:[0,4,0,8]},section:{fontSize:12,bold:true,color:'#0f4c81',margin:[0,10,0,4]}}};const pdf=printer.createPdfKitDocument(doc);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${data.project.project_code}-closeout.pdf"`);pdf.pipe(res);pdf.end();}catch(error){next(error);}});

module.exports=router;
