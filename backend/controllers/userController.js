const pool = require("../db");
const adminAuditService = require("../services/adminAuditService");

// ===================================
// Все пользователи
// ===================================

const getUsers = async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
      id,
      full_name,
      email,
      phone,
      role,
      created_at
      FROM users
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (err) {

    require("../utils/logger").error("userController failed", { error: err });

    res.status(500).json({
      message:"Ошибка сервера",
    });

  }

};

// ===================================
// Удаление пользователя
// ===================================

const deleteUser = async (req,res)=>{

  try{

    const {id}=req.params;

    if (Number(id) === Number(req.user.id)) {
      return res.status(409).json({
        code: "ADMIN_SELF_DELETE_BLOCKED",
        message: "Нельзя удалить текущую учётную запись администратора",
      });
    }

    const result = await pool.query(
      "DELETE FROM users WHERE id=$1 RETURNING id, full_name, email, role",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const deleted = result.rows[0];
    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "user_deleted",
      targetType: "user",
      targetId: deleted.id,
      metadata: { email: deleted.email, role: deleted.role },
    });

    res.json({
      message:"Пользователь удален",
    });

  }catch(err){

    require("../utils/logger").error("userController failed", { error: err });

    res.status(500).json({
      message:"Ошибка удаления",
    });

  }

};

module.exports={

  getUsers,

  deleteUser,

};