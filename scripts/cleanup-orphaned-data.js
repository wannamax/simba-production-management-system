const pool = require('../config/database');

async function cleanupOrphanedData() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Starting cleanup...\n');
    
    await client.query('BEGIN');
    
    // 1. Delete task_assignments for non-existent tasks
    const result1 = await client.query(`
      DELETE FROM task_assignments ta
      WHERE NOT EXISTS (
        SELECT 1 FROM tasks t WHERE t.id = ta.task_id
      )
    `);
    console.log(`✅ Deleted ${result1.rowCount} orphaned task_assignments`);
    
    // 2. Delete task_location_assignments for non-existent locations
    const result2 = await client.query(`
      DELETE FROM task_location_assignments tla
      WHERE NOT EXISTS (
        SELECT 1 FROM task_locations tl WHERE tl.id = tla.task_location_id
      )
    `);
    console.log(`✅ Deleted ${result2.rowCount} orphaned task_location_assignments`);
    
    // 3. Deactivate assignments for deleted projects
    const result3 = await client.query(`
      UPDATE task_assignments ta
      SET is_active = FALSE
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE ta.task_id = t.id
        AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
        AND ta.is_active = TRUE
    `);
    console.log(`✅ Deactivated ${result3.rowCount} assignments for deleted projects`);
    
    // 4. Deactivate assignments for paused/cancelled tasks
    const result4 = await client.query(`
      UPDATE task_assignments ta
      SET is_active = FALSE
      FROM tasks t
      WHERE ta.task_id = t.id
        AND t.status IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
        AND ta.is_active = TRUE
    `);
    console.log(`✅ Deactivated ${result4.rowCount} assignments for completed/paused tasks`);
    
    // 5. Delete schedule_assignments for non-existent schedules
    const result5 = await client.query(`
      DELETE FROM schedule_assignments sa
      WHERE NOT EXISTS (
        SELECT 1 FROM schedules s WHERE s.id = sa.schedule_id
      )
    `);
    console.log(`✅ Deleted ${result5.rowCount} orphaned schedule_assignments`);
    
    await client.query('COMMIT');
    
    console.log('\n✨ Cleanup completed successfully!');
    
    // Show summary
    const summary = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM task_assignments WHERE is_active = TRUE) as active_task_assignments,
        (SELECT COUNT(*) FROM task_assignments WHERE is_active = FALSE) as inactive_task_assignments,
        (SELECT COUNT(*) FROM tasks WHERE status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')) as active_tasks,
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) as active_projects
    `);
    
    console.log('\n📊 Current Status:');
    console.log('─────────────────────────────────────');
    console.log(`Active Projects: ${summary.rows[0].active_projects}`);
    console.log(`Active Tasks: ${summary.rows[0].active_tasks}`);
    console.log(`Active Assignments: ${summary.rows[0].active_task_assignments}`);
    console.log(`Inactive Assignments: ${summary.rows[0].inactive_task_assignments}`);
    console.log('─────────────────────────────────────\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run cleanup
cleanupOrphanedData()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });