require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_3mtt_school_portal_2026';

app.use(cors());
app.use(express.json());

// Initialize PostgreSQL Connection Pool using DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.ateovcsqmrmjzhdsvqsk:Dominicetim123%23%23@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

// Authentication Middleware: Verify JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Token missing.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// Admin Protection Middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Helper function to fetch student carryovers asynchronously
const getStudentCarryovers = async (studentId) => {
  try {
    const res = await pool.query(
      `SELECT course_code, semester FROM courses WHERE student_id = $1 AND UPPER(grade) = 'F'`,
      [studentId]
    );

    const rows = res.rows;
    const sem1 = rows.filter(r => Number(r.semester) === 1).map(r => r.course_code);
    const sem2 = rows.filter(r => Number(r.semester) === 2).map(r => r.course_code);

    return {
      first_semester_carryover: sem1.length > 0 ? sem1.join(', ') : 'NIL',
      second_semester_carryover: sem2.length > 0 ? sem2.join(', ') : 'NIL'
    };
  } catch (err) {
    console.error('Error fetching carryovers:', err);
    return { first_semester_carryover: 'NIL', second_semester_carryover: 'NIL' };
  }
};

// Helper function to migrate existing unhashed passwords to bcrypt
const migratePasswords = async () => {
  try {
    const admins = await pool.query(`SELECT id, password FROM admins`);
    for (const admin of admins.rows) {
      if (!admin.password.startsWith('$2a$') && !admin.password.startsWith('$2b$')) {
        console.log(`🔐 Migrating admin ID ${admin.id} password to bcrypt hash...`);
        const hashedPassword = await bcrypt.hash(admin.password, SALT_ROUNDS);
        await pool.query(`UPDATE admins SET password = $1 WHERE id = $2`, [hashedPassword, admin.id]);
      }
    }

    const students = await pool.query(`SELECT id, password FROM students`);
    for (const student of students.rows) {
      if (!student.password.startsWith('$2a$') && !student.password.startsWith('$2b$')) {
        console.log(`🔐 Migrating student ID ${student.id} password to bcrypt hash...`);
        const hashedPassword = await bcrypt.hash(student.password, SALT_ROUNDS);
        await pool.query(`UPDATE students SET password = $1 WHERE id = $2`, [hashedPassword, student.id]);
      }
    }
  } catch (err) {
    console.error('Error migrating passwords to bcrypt:', err);
  }
};

// Database Initialization & Seeding Function
const initDb = async () => {
  console.log('🔄 Checking & initializing PostgreSQL database tables on Supabase...');

  try {
    // Create Tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        matric_number VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        department VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        session VARCHAR(50) NOT NULL,
        level INTEGER NOT NULL,
        semester INTEGER NOT NULL,
        course_code VARCHAR(50) NOT NULL,
        course_title VARCHAR(255) NOT NULL,
        units INTEGER NOT NULL,
        score INTEGER NOT NULL,
        grade VARCHAR(10) NOT NULL
      );
    `);

    // Check if admins exist
    const adminCheck = await pool.query(`SELECT COUNT(*) FROM admins`);
    if (parseInt(adminCheck.rows[0].count, 10) === 0) {
      console.log('🌱 Seeding initial admin record with hashed password...');
      const hashedAdminPass = await bcrypt.hash('admin123', SALT_ROUNDS);
      await pool.query(
        `INSERT INTO admins (id, username, password, name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [1, 'admin', hashedAdminPass, 'Dr. Olatunji (Exam Officer)']
      );
    }

    // Check if students exist
    const studentCheck = await pool.query(`SELECT COUNT(*) FROM students`);
    if (parseInt(studentCheck.rows[0].count, 10) === 0) {
      console.log('🌱 Seeding initial student records with hashed passwords...');
      const defaultHashedPass = await bcrypt.hash('student123', SALT_ROUNDS);
      const students = [
        [1, 'RUN/ACC/21/1001', 'Adesina Emmanuel', 'Computer Science', defaultHashedPass, 'First Class Honours'],
        [2, 'RUN/ACC/21/1002', 'Babatunde Grace', 'Computer Science', defaultHashedPass, 'Good Standing'],
        [3, 'RUN/ACC/21/1003', 'Chukwuemeka David', 'Software Engineering', defaultHashedPass, 'Good Standing'],
        [4, 'RUN/ACC/21/1004', 'Damilola Samuel', 'Computer Science', defaultHashedPass, 'Good Standing'],
        [5, 'RUN/ACC/21/1005', 'Eze Jane', 'Cyber Security', defaultHashedPass, 'Good Standing'],
        [6, 'RUN/ACC/21/1006', 'Fashola Victor', 'Information Technology', defaultHashedPass, 'Good Standing'],
        [7, 'RUN/ACC/21/1007', 'Gbadamosi Faith', 'Computer Science', defaultHashedPass, 'Good Standing'],
        [8, 'RUN/ACC/21/1008', 'Hassan Usman', 'Software Engineering', defaultHashedPass, 'Good Standing'],
        [9, 'RUN/ACC/21/1009', 'Ibrahim Fatima', 'Cyber Security', defaultHashedPass, 'Good Standing'],
        [10, 'RUN/ACC/21/1010', 'Johnson Michael', 'Computer Science', defaultHashedPass, 'Good Standing']
      ];

      for (const s of students) {
        await pool.query(
          `INSERT INTO students (id, matric_number, name, department, password, status) 
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (matric_number) DO NOTHING`,
          s
        );
      }

      // Reset auto-increment sequence for students table
      await pool.query(`SELECT setval('students_id_seq', (SELECT MAX(id) FROM students))`);

      // Seed Courses using actual NUC CCMAS Computer Science Curriculum
      console.log('🌱 Seeding initial course records with NUC CCMAS CS curriculum...');

      // NUC CCMAS B.Sc. Computer Science Curriculum Data (mirrors frontend csCoursesData.js)
      const csCurriculum = {
        100: {
          1: [
            { code: 'GST 111', title: 'Communication in English', units: 2 },
            { code: 'CSC 101', title: 'Introduction to Computer Science', units: 3 },
            { code: 'MTH 101', title: 'Elementary Mathematics I (Algebra & Trigonometry)', units: 3 },
            { code: 'PHY 101', title: 'General Physics I (Mechanics & Thermal Physics)', units: 3 },
            { code: 'PHY 107', title: 'General Physics Practical I', units: 1 },
            { code: 'CHM 101', title: 'General Chemistry I', units: 3 },
            { code: 'CHM 107', title: 'General Chemistry Practical I', units: 1 },
            { code: 'STA 111', title: 'Descriptive Statistics', units: 2 }
          ],
          2: [
            { code: 'GST 112', title: 'Nigerian Peoples and Culture', units: 2 },
            { code: 'CSC 102', title: 'Problem Solving & Essentials of Programming', units: 3 },
            { code: 'MTH 102', title: 'Elementary Mathematics II (Calculus)', units: 3 },
            { code: 'PHY 102', title: 'General Physics II (Electricity & Magnetism)', units: 3 },
            { code: 'PHY 108', title: 'General Physics Practical II', units: 1 },
            { code: 'CHM 102', title: 'General Chemistry II', units: 3 }
          ]
        },
        200: {
          1: [
            { code: 'GST 212', title: 'Philosophy, Logic and Human Existence', units: 2 },
            { code: 'ENT 211', title: 'Entrepreneurship and Innovation', units: 2 },
            { code: 'CSC 201', title: 'Computer Programming I (Structured Programming)', units: 3 },
            { code: 'CSC 203', title: 'Discrete Structures / Discrete Mathematics', units: 2 },
            { code: 'CSC 211', title: 'Digital Logic Design', units: 2 },
            { code: 'SEN 201', title: 'Introduction to Software Engineering', units: 2 },
            { code: 'MTH 201', title: 'Mathematical Methods I', units: 2 }
          ],
          2: [
            { code: 'CSC 202', title: 'Computer Programming II (Object-Oriented Programming)', units: 3 },
            { code: 'CSC 212', title: 'Computer Architecture and Organization', units: 2 },
            { code: 'CSC 204', title: 'Systems Analysis and Design', units: 2 },
            { code: 'CSC 206', title: 'Fundamentals of Data Structures', units: 3 },
            { code: 'MTH 202', title: 'Elementary Differential Equations', units: 2 },
            { code: 'STA 202', title: 'Statistics for Physical Sciences', units: 2 }
          ]
        },
        300: {
          1: [
            { code: 'CSC 301', title: 'Data Structures and Algorithms', units: 3 },
            { code: 'CSC 308', title: 'Operating Systems I', units: 3 },
            { code: 'CSC 309', title: 'Artificial Intelligence', units: 2 },
            { code: 'ICT 305', title: 'Data Communication Systems & Networking', units: 3 },
            { code: 'IFT 305', title: 'Web Application Development', units: 2 },
            { code: 'GST 312', title: 'Peace Studies and Conflict Resolution', units: 2 }
          ],
          2: [
            { code: 'ENT 312', title: 'Venture Creation', units: 2 },
            { code: 'CSC 304', title: 'Database Management Systems (Data Management I)', units: 3 },
            { code: 'CSC 322', title: 'Computer Science Innovation & Emerging Technologies', units: 2 },
            { code: 'CSC 399', title: 'Students Industrial Work Experience Scheme (SIWES II)', units: 6 }
          ]
        },
        400: {
          1: [
            { code: 'CSC 401', title: 'Algorithms and Complexity Analysis', units: 2 },
            { code: 'CSC 403', title: 'Compiler Construction', units: 3 },
            { code: 'CSC 409', title: 'Research Methodology and Technical Report Writing', units: 3 },
            { code: 'INS 401', title: 'IT Project Management', units: 2 },
            { code: 'CSC 405', title: 'Mobile and Pervasive Computing', units: 2 },
            { code: 'CSC 497', title: 'Final Year Research Project I', units: 3 }
          ],
          2: [
            { code: 'CSC 402', title: 'Ethics and Legal Issues in Computing', units: 2 },
            { code: 'CSC 432', title: 'Distributed Computing Systems', units: 2 },
            { code: 'CSC 408', title: 'Cloud Computing & Infrastructure', units: 2 },
            { code: 'CSC 404', title: 'Advanced Database Systems / Big Data', units: 2 },
            { code: 'CSC 498', title: 'Final Year Research Project II', units: 6 }
          ]
        }
      };

      const sessionsConfig = [
        { session: '2022/2023', level: 100 },
        { session: '2023/2024', level: 200 },
        { session: '2024/2025', level: 300 },
        { session: '2025/2026', level: 400 }
      ];

      for (let studentId = 1; studentId <= 10; studentId++) {
        for (const sess of sessionsConfig) {
          for (const semNum of [1, 2]) {
            const courses = csCurriculum[sess.level][semNum] || [];

            for (let i = 0; i < courses.length; i++) {
              const c = courses[i];

              let score, grade;
              // Student 1 (Adesina Emmanuel) - high performer with some B's and C's
              if (studentId === 1) {
                if (i === 2) { score = 64; grade = 'B'; }
                else if (i === 5 && semNum === 1) { score = 56; grade = 'C'; }
                else { score = 72 + ((i * 3 + semNum) % 18); grade = 'A'; }
              } else {
                // Other students - varied performance with occasional carryovers
                if (i === 4 && sess.level === 200 && semNum === 1) {
                  score = 38; grade = 'F'; // Carryover test for 200L Sem 1
                } else if (i === 2 && sess.level === 300 && semNum === 2 && studentId === 3) {
                  score = 35; grade = 'F'; // Carryover test for student 3
                } else {
                  score = 48 + ((studentId + i * 3 + semNum * 7) % 42);
                  grade = score >= 70 ? 'A' : score >= 60 ? 'B' : score >= 50 ? 'C' : score >= 45 ? 'D' : 'F';
                }
              }

              await pool.query(
                `INSERT INTO courses (student_id, session, level, semester, course_code, course_title, units, score, grade) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [studentId, sess.session, sess.level, semNum, c.code, c.title, c.units, score, grade]
              );
            }
          }
        }
      }
    }

    // Migrate any existing plain-text passwords in database to bcrypt
    await migratePasswords();

    console.log('✅ PostgreSQL Database initialized and bcrypt password migration verified!');
  } catch (err) {
    console.error('❌ Error initializing PostgreSQL database:', err);
  }
};

initDb();

// Student Login Route (with JWT output)
app.post('/api/login', async (req, res) => {
  const { matricNumber, password } = req.body;
  const cleanMatric = matricNumber ? matricNumber.trim() : '';
  const cleanPassword = password ? password.trim() : '';

  if (!cleanMatric || !cleanPassword) {
    return res.status(400).json({ error: 'Matric Number and Password are required.' });
  }

  try {
    const studentRes = await pool.query(
      `SELECT * FROM students WHERE UPPER(matric_number) = UPPER($1)`,
      [cleanMatric]
    );

    if (studentRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Matric Number or Password' });
    }

    const student = studentRes.rows[0];

    // Verify bcrypt password hash
    const isPasswordValid = await bcrypt.compare(cleanPassword, student.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid Matric Number or Password' });
    }

    const token = jwt.sign(
      { id: student.id, matricNumber: student.matric_number, role: 'student' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const coursesRes = await pool.query(
      `SELECT id, session, level, semester, course_code, course_title, units, score, grade FROM courses WHERE student_id = $1 ORDER BY session ASC, level ASC, semester ASC`,
      [student.id]
    );

    const carryovers = await getStudentCarryovers(student.id);

    res.json({
      role: 'student',
      token,
      id: student.id,
      name: student.name,
      matric_number: student.matric_number,
      department: student.department,
      status: student.status,
      carryovers: carryovers,
      courses: coursesRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error during login' });
  }
});

// Admin Login Route (with JWT output)
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const cleanUser = username ? username.trim() : '';
  const cleanPass = password ? password.trim() : '';

  if (!cleanUser || !cleanPass) {
    return res.status(400).json({ error: 'Username and Password are required.' });
  }

  try {
    const adminRes = await pool.query(
      `SELECT * FROM admins WHERE username = $1`,
      [cleanUser]
    );

    if (adminRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Admin Username or Password' });
    }

    const admin = adminRes.rows[0];

    // Verify bcrypt password hash
    const isPasswordValid = await bcrypt.compare(cleanPass, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid Admin Username or Password' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      role: 'admin',
      token,
      id: admin.id,
      name: admin.name,
      username: admin.username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error during admin login' });
  }
});

// Get all students (Admin Protected)
app.get('/api/admin/students', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const studentsRes = await pool.query(
      `SELECT id, matric_number, name, department, status FROM students ORDER BY id ASC`
    );

    const result = await Promise.all(studentsRes.rows.map(async (student) => ({
      ...student,
      carryovers: await getStudentCarryovers(student.id)
    })));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Register New Student (Admin Protected)
app.post('/api/admin/students', authenticateToken, requireAdmin, async (req, res) => {
  const { matricNumber, name, department, password, status } = req.body;

  const cleanMatric = matricNumber ? matricNumber.trim() : '';
  const cleanName = name ? name.trim() : '';
  const cleanDept = department ? department.trim() : 'Computer Science';
  const cleanPass = password ? password.trim() : 'student123';
  const cleanStatus = status ? status.trim() : 'Good Standing';

  if (!cleanMatric || !cleanName) {
    return res.status(400).json({ error: 'Matriculation Number and Name are required.' });
  }

  try {
    // Check if matric number already exists
    const checkRes = await pool.query(
      `SELECT id FROM students WHERE UPPER(matric_number) = UPPER($1)`,
      [cleanMatric]
    );

    if (checkRes.rows.length > 0) {
      return res.status(400).json({ error: `Student with Matric Number '${cleanMatric}' already exists.` });
    }

    const hashedPassword = await bcrypt.hash(cleanPass, SALT_ROUNDS);

    const insertRes = await pool.query(
      `INSERT INTO students (matric_number, name, department, password, status) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, matric_number, name, department, status`,
      [cleanMatric, cleanName, cleanDept, hashedPassword, cleanStatus]
    );

    res.status(201).json({
      message: 'Student registered successfully',
      student: insertRes.rows[0]
    });
  } catch (err) {
    console.error('Error registering student:', err);
    res.status(500).json({ error: 'Failed to register student.' });
  }
});

// Update Student Profile (Admin Protected)
app.put('/api/admin/students/:id', authenticateToken, requireAdmin, async (req, res) => {
  const studentId = req.params.id;
  const { matricNumber, name, department, status } = req.body;

  try {
    const updateRes = await pool.query(
      `UPDATE students SET matric_number = $1, name = $2, department = $3, status = $4 WHERE id = $5 RETURNING id, matric_number, name, department, status`,
      [matricNumber, name, department, status, studentId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    res.json({ message: 'Student updated successfully', student: updateRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update student profile.' });
  }
});

// Delete Student (Admin Protected)
app.delete('/api/admin/students/:id', authenticateToken, requireAdmin, async (req, res) => {
  const studentId = req.params.id;

  try {
    const deleteRes = await pool.query(`DELETE FROM students WHERE id = $1 RETURNING id`, [studentId]);

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    res.json({ message: 'Student and associated course records deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete student.' });
  }
});

// Reset Student Password (Admin Protected)
app.post('/api/admin/students/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const studentId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword.trim(), SALT_ROUNDS);
    const updateRes = await pool.query(
      `UPDATE students SET password = $1 WHERE id = $2 RETURNING id`,
      [hashedPassword, studentId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Get student courses (Admin Protected or Authenticated Student)
app.get('/api/admin/students/:id/courses', authenticateToken, async (req, res) => {
  const studentId = req.params.id;

  // Verify authorization: either admin or the student themselves
  if (req.user.role !== 'admin' && String(req.user.id) !== String(studentId)) {
    return res.status(403).json({ error: 'Unauthorized to view these courses.' });
  }

  try {
    const coursesRes = await pool.query(
      `SELECT id, session, level, semester, course_code, course_title, units, score, grade FROM courses WHERE student_id = $1 ORDER BY session ASC, level ASC, semester ASC`,
      [studentId]
    );

    const carryovers = await getStudentCarryovers(studentId);

    res.json({ courses: coursesRes.rows, carryovers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Add course record (Admin Protected)
app.post('/api/courses', authenticateToken, requireAdmin, async (req, res) => {
  const { studentId, session, level, semester, courseCode, courseTitle, units, score, grade } = req.body;

  if (!studentId || !session || !level || !semester || !courseCode || !courseTitle || units === undefined || score === undefined || !grade) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const insertRes = await pool.query(
      `INSERT INTO courses (student_id, session, level, semester, course_code, course_title, units, score, grade) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [Number(studentId), session, Number(level), Number(semester), courseCode, courseTitle, Number(units), Number(score), grade]
    );

    res.json({ message: 'Course added successfully', courseId: insertRes.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to insert course record' });
  }
});

// Edit existing course record (Admin Protected)
app.put('/api/courses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const { session, level, semester, courseCode, courseTitle, units, score, grade } = req.body;

  try {
    const updateRes = await pool.query(
      `UPDATE courses 
       SET session = $1, level = $2, semester = $3, course_code = $4, course_title = $5, units = $6, score = $7, grade = $8 
       WHERE id = $9 RETURNING id`,
      [session, Number(level), Number(semester), courseCode, courseTitle, Number(units), Number(score), grade, courseId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Course record not found.' });
    }

    res.json({ message: 'Course record updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update course record.' });
  }
});

// Delete course record (Admin Protected)
app.delete('/api/courses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;

  try {
    const deleteRes = await pool.query(`DELETE FROM courses WHERE id = $1 RETURNING id`, [courseId]);

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Course record not found.' });
    }

    res.json({ message: 'Course record deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete course record.' });
  }
});

// Bulk upload course records (Admin Protected)
app.post('/api/courses/bulk', authenticateToken, requireAdmin, async (req, res) => {
  const { courses } = req.body; // Expects an array of course objects

  if (!Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of course records.' });
  }

  try {
    let successCount = 0;
    for (const c of courses) {
      await pool.query(
        `INSERT INTO courses (student_id, session, level, semester, course_code, course_title, units, score, grade) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [Number(c.studentId), c.session, Number(c.level), Number(c.semester), c.courseCode, c.courseTitle, Number(c.units), Number(c.score), c.grade]
      );
      successCount++;
    }

    res.json({ message: `Successfully bulk uploaded ${successCount} course records.` });
  } catch (err) {
    console.error('Error during bulk course upload:', err);
    res.status(500).json({ error: 'Failed during bulk course upload.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
