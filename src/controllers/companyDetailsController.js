// ============================================
// COMPANY DETAILS CONTROLLER
// User dashboard ke "Company Details" box ke liye.
// CS (admin) text/file upload/update karta hai,
// user sirf dekh sakta hai.
// ============================================

const pool = require('../config/database');

// User aur Admin dono ke liye - current company details laana
async function getCompanyDetails(req, res) {
    try {
        const result = await pool.query('SELECT * FROM company_details WHERE id = 1');
        if (result.rows.length === 0) {
            return res.status(200).json({ success: true, details: { text_content: null, file_url: null, file_name: null } });
        }
        return res.status(200).json({ success: true, details: result.rows[0] });
    } catch (error) {
        console.error('Get company details error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// Sirf Admin - text aur/ya file update karna
async function updateCompanyDetails(req, res) {
    try {
        const { textContent, fileUrl, fileName } = req.body;

        const result = await pool.query(
            `UPDATE company_details
             SET text_content = $1, file_url = $2, file_name = $3, updated_at = NOW()
             WHERE id = 1 RETURNING *`,
            [textContent || null, fileUrl || null, fileName || null]
        );

        if (result.rows.length === 0) {
            // Agar row exist nahi karti (pehli dafa), bana do
            const insertResult = await pool.query(
                `INSERT INTO company_details (id, text_content, file_url, file_name)
                 VALUES (1, $1, $2, $3) RETURNING *`,
                [textContent || null, fileUrl || null, fileName || null]
            );
            return res.status(200).json({ success: true, details: insertResult.rows[0] });
        }

        return res.status(200).json({ success: true, details: result.rows[0] });
    } catch (error) {
        console.error('Update company details error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

module.exports = { getCompanyDetails, updateCompanyDetails };
