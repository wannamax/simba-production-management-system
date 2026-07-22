const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const ORDER_STATUSES = ['NOT_STARTED','IN_PRODUCTION','COMPLETED','CANCELLED'];

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) throw fail('Đơn hàng cần ít nhất một hạng mục');
  return items.map((item, index) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price || 0);
    if (!String(item.item_name || '').trim()) throw fail(`Hạng mục ${index + 1}: chưa có tên`);
    if (!(quantity > 0)) throw fail(`Hạng mục ${index + 1}: số lượng phải lớn hơn 0`);
    if (unitPrice < 0) throw fail(`Hạng mục ${index + 1}: đơn giá không hợp lệ`);
    return {
      item_code: String(item.item_code || '').trim() || null,
      item_name: String(item.item_name).trim(),
      unit: String(item.unit || 'Cái').trim(),
      quantity,
      unit_price: unitPrice,
      notes: String(item.notes || '').trim() || null,
    };
  });
}

async function generateOrderCode(db) {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}`;
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`project_orders.order_code.${prefix}`]);
  const result = await db.query(
    `SELECT COALESCE(MAX(CASE WHEN substring(order_code FROM char_length($1)+1) ~ '^[0-9]+$'
       THEN substring(order_code FROM char_length($1)+1)::int END),0)+1 next_number
     FROM project_orders WHERE order_code LIKE $2`,
    [prefix, `${prefix}%`]
  );
  return `${prefix}${String(result.rows[0].next_number).padStart(4, '0')}`;
}

async function insertItems(db, orderId, items) {
  for (const item of items) {
    await db.query(
      `INSERT INTO project_order_items(order_id,item_code,item_name,unit,quantity,unit_price,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [orderId,item.item_code,item.item_name,item.unit,item.quantity,item.unit_price,item.notes]
    );
  }
}

async function insertChangeLog(db,{orderId,orderItemId=null,changeType,reason,beforeData=null,afterData=null,userId}){
  const normalizedReason=String(reason||'').trim();
  if(normalizedReason.length<3)throw fail('Cần nhập lý do điều chỉnh để ghi Nhật ký Đơn hàng');
  await db.query(`INSERT INTO order_item_change_logs(order_id,order_item_id,change_type,reason,before_data,after_data,changed_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[orderId,orderItemId,changeType,normalizedReason,beforeData?JSON.stringify(beforeData):null,afterData?JSON.stringify(afterData):null,userId]);
}

async function getProductionTaskIds(db, orderId) {
  const result = await db.query(
    `SELECT DISTINCT linked.task_id
     FROM (
       SELECT work.id::integer task_id
       FROM production_orders production
       JOIN production_stage_instances stage ON stage.production_order_id=production.id
       JOIN tasks work ON work.production_stage_instance_id=stage.id
       WHERE production.order_id=$1
       UNION
       SELECT stage.task_id::integer task_id
       FROM production_orders production
       JOIN production_stage_instances stage ON stage.production_order_id=production.id
       WHERE production.order_id=$1 AND stage.task_id IS NOT NULL
     ) linked`,
    [orderId]
  );
  return result.rows.map(row => Number(row.task_id));
}

async function getOrder(db, id) {
  const order = await db.query(
    `SELECT o.*,p.project_code,p.project_name,p.project_type,c.company_name,
      COALESCE((SELECT SUM(i.quantity*i.unit_price) FROM project_order_items i WHERE i.order_id=o.id),0) total_amount
     FROM project_orders o JOIN projects p ON p.id=o.project_id
     LEFT JOIN customers c ON c.id=p.customer_id WHERE o.id=$1 AND p.deleted_at IS NULL`,
    [id]
  );
  if (!order.rowCount) throw fail('Không tìm thấy đơn hàng', 404);
  const [items, productions, changeLogs] = await Promise.all([
    db.query(
      `SELECT i.*,
        COALESCE((SELECT SUM(pi.planned_quantity) FROM production_order_items pi
          JOIN production_orders po ON po.id=pi.production_order_id
          WHERE pi.order_item_id=i.id AND po.status<>'CANCELLED'),0) allocated_quantity,
        COALESCE((SELECT SUM(COALESCE((SELECT psi.good_quantity
          FROM production_stage_items psi JOIN production_stage_instances stage ON stage.id=psi.stage_instance_id
          WHERE psi.production_order_item_id=pi.id AND stage.tracks_quantity=true
          ORDER BY stage.sequence_no DESC,psi.id DESC LIMIT 1),0))
          FROM production_order_items pi JOIN production_orders po ON po.id=pi.production_order_id
          WHERE pi.order_item_id=i.id AND po.status<>'CANCELLED'),0) completed_quantity
       FROM project_order_items i WHERE i.order_id=$1 ORDER BY i.id`, [id]
    ),
    db.query(
      `SELECT po.*,
        COALESCE((SELECT AVG(CASE WHEN si.tracks_quantity THEN 100*psi.good_quantity/NULLIF(psi.planned_quantity,0) ELSE 0 END)
          FROM production_stage_instances si JOIN production_stage_items psi ON psi.stage_instance_id=si.id
          WHERE si.production_order_id=po.id),0) progress,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pi.id,'order_item_id',source.id,
          'item_code',source.item_code,'item_name',source.item_name,'unit',source.unit,
          'planned_quantity',pi.planned_quantity,'completed_quantity',COALESCE((SELECT psi.good_quantity
            FROM production_stage_items psi JOIN production_stage_instances stage ON stage.id=psi.stage_instance_id
            WHERE psi.production_order_item_id=pi.id AND stage.tracks_quantity=true
            ORDER BY stage.sequence_no DESC,psi.id DESC LIMIT 1),0)) ORDER BY source.id)
          FROM production_order_items pi JOIN project_order_items source ON source.id=pi.order_item_id
          WHERE pi.production_order_id=po.id),'[]'::jsonb) items
       FROM production_orders po WHERE po.order_id=$1 ORDER BY po.created_at DESC`, [id]
    ),
    db.query(`SELECT log.*,item.item_code,item.item_name,user_account.full_name changed_by_name
      FROM order_item_change_logs log
      LEFT JOIN project_order_items item ON item.id=log.order_item_id
      LEFT JOIN users user_account ON user_account.id=log.changed_by
      WHERE log.order_id=$1 ORDER BY log.created_at DESC,log.id DESC`,[id]),
  ]);
  return { ...order.rows[0], items:items.rows, production_orders:productions.rows, change_logs:changeLogs.rows };
}

router.get('/meta', async (req, res, next) => {
  try {
    const [projects, units] = await Promise.all([
      pool.query(`SELECT p.id,p.project_code,p.project_name,p.project_type,c.company_name
        FROM projects p LEFT JOIN customers c ON c.id=p.customer_id
        WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`),
      pool.query(`SELECT name FROM system_catalogs WHERE catalog_type='UNIT' AND is_active=true ORDER BY sort_order,name`),
    ]);
    res.json({ success:true, data:{ projects:projects.rows, units:units.rows.map(row => row.name), statuses:ORDER_STATUSES } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const params=[];
    let where='WHERE p.deleted_at IS NULL';
    if (req.query.project_id) { params.push(req.query.project_id); where+=` AND o.project_id=$${params.length}`; }
    if (req.query.status) { params.push(req.query.status); where+=` AND o.status=$${params.length}`; }
    if (req.query.search) { params.push(`%${req.query.search}%`); where+=` AND (o.order_code ILIKE $${params.length} OR p.project_name ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`; }
    const result=await pool.query(
      `SELECT o.*,p.project_code,p.project_name,p.project_type,c.company_name,
        (SELECT COUNT(*)::int FROM project_order_items i WHERE i.order_id=o.id) item_count,
        COALESCE((SELECT SUM(i.quantity*i.unit_price) FROM project_order_items i WHERE i.order_id=o.id),0) total_amount,
        (SELECT COUNT(*)::int FROM production_orders po WHERE po.order_id=o.id AND po.status<>'CANCELLED') production_order_count
       FROM project_orders o JOIN projects p ON p.id=o.project_id LEFT JOIN customers c ON c.id=p.customer_id
       ${where} ORDER BY o.created_at DESC`, params
    );
    res.json({success:true,data:result.rows});
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json({success:true,data:await getOrder(pool,req.params.id)}); }
  catch (error) { if(error.status) return res.status(error.status).json({success:false,message:error.message}); next(error); }
});

router.post('/:id/items',async(req,res,next)=>{
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const order=await db.query(`SELECT * FROM project_orders WHERE id=$1 FOR UPDATE`,[req.params.id]);
    if(!order.rowCount)throw fail('Không tìm thấy đơn hàng',404);
    if(['COMPLETED','CANCELLED'].includes(order.rows[0].status))throw fail('Không thể thêm hạng mục vào Đơn hàng đã hoàn thành hoặc đã hủy',409);
    const item=normalizeItems([req.body])[0];
    const inserted=await db.query(`INSERT INTO project_order_items(order_id,item_code,item_name,unit,quantity,unit_price,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[req.params.id,item.item_code,item.item_name,item.unit,item.quantity,item.unit_price,item.notes]);
    await insertChangeLog(db,{orderId:req.params.id,orderItemId:inserted.rows[0].id,changeType:'ADD_ITEM',reason:req.body.reason,
      afterData:inserted.rows[0],userId:req.user?.id||1});
    await db.query('COMMIT');
    res.status(201).json({success:true,message:'Đã thêm hạng mục và ghi Nhật ký Đơn hàng',data:await getOrder(pool,req.params.id)});
  }catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}
});

router.patch('/:id/items/:itemId/quantity',async(req,res,next)=>{
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const order=await db.query(`SELECT * FROM project_orders WHERE id=$1 FOR UPDATE`,[req.params.id]);
    if(!order.rowCount)throw fail('Không tìm thấy đơn hàng',404);
    if(['COMPLETED','CANCELLED'].includes(order.rows[0].status))throw fail('Không thể điều chỉnh Đơn hàng đã hoàn thành hoặc đã hủy',409);
    const item=await db.query(`SELECT * FROM project_order_items WHERE id=$1 AND order_id=$2 FOR UPDATE`,[req.params.itemId,req.params.id]);
    if(!item.rowCount)throw fail('Không tìm thấy hạng mục thuộc Đơn hàng',404);
    const quantity=Number(req.body.quantity);if(!(quantity>0))throw fail('Số lượng mới phải lớn hơn 0');
    const allocation=await db.query(`SELECT COALESCE(SUM(pi.planned_quantity),0) allocated_quantity,
      COALESCE(SUM(COALESCE((SELECT psi.good_quantity FROM production_stage_items psi
        JOIN production_stage_instances stage ON stage.id=psi.stage_instance_id
        WHERE psi.production_order_item_id=pi.id AND stage.tracks_quantity=true
        ORDER BY stage.sequence_no DESC,psi.id DESC LIMIT 1),0)),0) completed_quantity
      FROM production_order_items pi JOIN production_orders po ON po.id=pi.production_order_id
      WHERE pi.order_item_id=$1 AND po.status<>'CANCELLED'`,[req.params.itemId]);
    const allocated=Number(allocation.rows[0].allocated_quantity),completed=Number(allocation.rows[0].completed_quantity);
    if(quantity<allocated)throw fail(`Không thể giảm dưới ${allocated} ${item.rows[0].unit} đã cấp vào Lệnh SX. Hãy sửa hoặc hủy Lệnh chưa hoàn thành trước.`,409);
    if(quantity<completed)throw fail(`Không thể giảm dưới ${completed} ${item.rows[0].unit} đã hoàn thành`,409);
    const updated=await db.query(`UPDATE project_order_items SET quantity=$1 WHERE id=$2 RETURNING *`,[quantity,req.params.itemId]);
    await insertChangeLog(db,{orderId:req.params.id,orderItemId:req.params.itemId,changeType:'QUANTITY_CHANGE',reason:req.body.reason,
      beforeData:item.rows[0],afterData:updated.rows[0],userId:req.user?.id||1});
    await db.query('COMMIT');
    res.json({success:true,message:'Đã điều chỉnh số lượng và ghi Nhật ký Đơn hàng',data:await getOrder(pool,req.params.id)});
  }catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}
});

router.post('/', async (req, res, next) => {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const items=normalizeItems(req.body.items);
    const project=await db.query('SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL',[req.body.project_id]);
    if(!project.rowCount) throw fail('Dự án không tồn tại hoặc đã bị xóa');
    const code=await generateOrderCode(db);
    const order=await db.query(
      `INSERT INTO project_orders(order_code,project_id,order_date,expected_delivery_date,notes,created_by)
       VALUES($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6) RETURNING *`,
      [code,req.body.project_id,req.body.order_date||null,req.body.expected_delivery_date||null,req.body.notes||null,req.user?.id||1]
    );
    await insertItems(db,order.rows[0].id,items);
    await db.query('COMMIT');
    res.status(201).json({success:true,message:'Đã tạo đơn hàng — trạng thái Chưa sản xuất',data:await getOrder(pool,order.rows[0].id)});
  } catch(error) {
    await db.query('ROLLBACK');
    if(error.status) return res.status(error.status).json({success:false,message:error.message});
    next(error);
  } finally { db.release(); }
});

router.put('/:id', async (req, res, next) => {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const current=await db.query('SELECT * FROM project_orders WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!current.rowCount) throw fail('Không tìm thấy đơn hàng',404);
    if(current.rows[0].status!=='NOT_STARTED') throw fail('Chỉ đơn hàng Chưa sản xuất mới được sửa',409);
    const items=normalizeItems(req.body.items);
    await db.query(`UPDATE project_orders SET project_id=$1,order_date=$2,expected_delivery_date=$3,notes=$4 WHERE id=$5`,
      [req.body.project_id,current.rows[0].order_date?req.body.order_date||current.rows[0].order_date:req.body.order_date,req.body.expected_delivery_date||null,req.body.notes||null,req.params.id]);
    await db.query('DELETE FROM project_order_items WHERE order_id=$1',[req.params.id]);
    await insertItems(db,req.params.id,items);
    await db.query('COMMIT');
    res.json({success:true,message:'Đã cập nhật đơn hàng',data:await getOrder(pool,req.params.id)});
  } catch(error){ await db.query('ROLLBACK'); if(error.status)return res.status(error.status).json({success:false,message:error.message}); next(error); }
  finally{db.release();}
});

router.post('/:id/confirm', async (req,res,next)=>{
  try{
    const result=await pool.query(`SELECT * FROM project_orders WHERE id=$1`,[req.params.id]);
    if(!result.rowCount)return res.status(404).json({success:false,message:'Không tìm thấy đơn hàng'});
    res.json({success:true,message:'Đơn hàng đã sẵn sàng lập Lệnh sản xuất, không cần bước xác nhận riêng',data:result.rows[0]});
  }catch(error){next(error);}
});

router.post('/:id/cancel',async(req,res,next)=>{
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const current=await db.query('SELECT id,order_code,status FROM project_orders WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!current.rowCount)throw fail('Không tìm thấy đơn hàng',404);
    if(current.rows[0].status==='CANCELLED')throw fail('Đơn hàng đã được hủy trước đó',409);
    const reason=String(req.body?.reason||'Hủy Đơn hàng từ màn hình Đơn hàng').trim();
    const userId=req.user?.id||1;
    const taskIds=await getProductionTaskIds(db,req.params.id);
    if(taskIds.length){
      await db.query(`UPDATE tasks SET deleted_at=COALESCE(deleted_at,NOW()),deleted_by=$1,status='Hủy',updated_at=NOW()
        WHERE id=ANY($2::integer[])`,[userId,taskIds]);
    }
    await db.query(`UPDATE production_orders SET status='CANCELLED',cancelled_at=COALESCE(cancelled_at,NOW()),
      cancelled_by=COALESCE(cancelled_by,$1),cancellation_reason=COALESCE(cancellation_reason,$2)
      WHERE order_id=$3`,[userId,reason,req.params.id]);
    await db.query(`UPDATE production_plans SET status='CANCELLED',cancelled_at=COALESCE(cancelled_at,NOW()),
      cancelled_by=COALESCE(cancelled_by,$1),cancellation_reason=COALESCE(cancellation_reason,$2)
      WHERE order_id=$3`,[userId,reason,req.params.id]);
    await db.query(`UPDATE project_orders SET status='CANCELLED',cancelled_at=NOW(),cancelled_by=$1,cancellation_reason=$2
      WHERE id=$3`,[userId,reason,req.params.id]);
    await db.query('COMMIT');
    res.json({success:true,message:`Đã hủy đơn hàng ${current.rows[0].order_code} và ${taskIds.length} Công việc liên quan`,data:{id:Number(req.params.id),cancelled_task_count:taskIds.length}});
  }catch(error){
    await db.query('ROLLBACK');
    if(error.status)return res.status(error.status).json({success:false,message:error.message});
    next(error);
  }finally{db.release();}
});

router.delete('/:id',async(req,res,next)=>{
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const current=await db.query('SELECT id,order_code FROM project_orders WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!current.rowCount)throw fail('Không tìm thấy đơn hàng',404);
    const taskIds=await getProductionTaskIds(db,req.params.id);
    if(taskIds.length)await db.query('DELETE FROM tasks WHERE id=ANY($1::integer[])',[taskIds]);
    // Remove production trees before order items so the legacy order-item FK
    // cannot block deletion while PostgreSQL is resolving parallel cascades.
    await db.query('DELETE FROM production_plans WHERE order_id=$1',[req.params.id]);
    await db.query('DELETE FROM production_orders WHERE order_id=$1',[req.params.id]);
    await db.query('DELETE FROM project_orders WHERE id=$1',[req.params.id]);
    await db.query('COMMIT');
    res.json({success:true,message:`Đã xóa đơn hàng ${current.rows[0].order_code} và ${taskIds.length} Công việc liên quan`,data:{id:Number(req.params.id),deleted_task_count:taskIds.length}});
  }catch(error){
    await db.query('ROLLBACK');
    if(error.status)return res.status(error.status).json({success:false,message:error.message});
    next(error);
  }finally{db.release();}
});

module.exports=router;
