require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.ateovcsqmrmjzhdsvqsk:Dominicetim123%23%23@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

const SALT_ROUNDS = 10;

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

async function resetDb() {
  console.log('⚠️ Truncating existing tables to cleanly re-seed NUC CS curriculum...');
  try {
    // Truncate tables with cascade
    await pool.query('TRUNCATE TABLE courses, students CASCADE');
    console.log('✅ Tables truncated successfully.');

    // Seed Admins if not exist
    const adminCheck = await pool.query('SELECT COUNT(*) FROM admins');
    if (parseInt(adminCheck.rows[0].count, 10) === 0) {
      console.log('🌱 Seeding admin...');
      const hashedAdminPass = await bcrypt.hash('admin123', SALT_ROUNDS);
      await pool.query(
        `INSERT INTO admins (id, username, password, name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [1, 'admin', hashedAdminPass, 'Dr. Olatunji (Exam Officer)']
      );
    }

    // Seed Students
    console.log('🌱 Seeding student records...');
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
         VALUES ($1, $2, $3, $4, $5, $6)`,
        s
      );
    }
    await pool.query(`SELECT setval('students_id_seq', (SELECT MAX(id) FROM students))`);
    console.log('✅ Students seeded.');

    // Build one large multi-row insert query for courses
    console.log('🌱 Bulking course inserts...');
    const values = [];
    const valPlaceholders = [];
    let paramIndex = 1;

    for (let studentId = 1; studentId <= 10; studentId++) {
      for (const sess of sessionsConfig) {
        for (const semNum of [1, 2]) {
          const courses = csCurriculum[sess.level][semNum] || [];

          for (let i = 0; i < courses.length; i++) {
            const c = courses[i];

            let score, grade;
            if (studentId === 1) {
              if (i === 2) { score = 64; grade = 'B'; }
              else if (i === 5 && semNum === 1) { score = 56; grade = 'C'; }
              else { score = 72 + ((i * 3 + semNum) % 18); grade = 'A'; }
            } else {
              if (i === 4 && sess.level === 200 && semNum === 1) {
                score = 38; grade = 'F';
              } else if (i === 2 && sess.level === 300 && semNum === 2 && studentId === 3) {
                score = 35; grade = 'F';
              } else {
                score = 48 + ((studentId + i * 3 + semNum * 7) % 42);
                grade = score >= 70 ? 'A' : score >= 60 ? 'B' : score >= 50 ? 'C' : score >= 45 ? 'D' : 'F';
              }
            }

            values.push(studentId, sess.session, sess.level, semNum, c.code, c.title, c.units, score, grade);
            valPlaceholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8})`);
            paramIndex += 9;
          }
        }
      }
    }

    console.log(`🚀 Executing bulk insert of ${valPlaceholders.length} courses...`);
    const insertQuery = `INSERT INTO courses (student_id, session, level, semester, course_code, course_title, units, score, grade) VALUES ${valPlaceholders.join(', ')}`;
    await pool.query(insertQuery, values);

    console.log('✅ Courses seeded successfully.');
    console.log('🚀 Database successfully updated & aligned with new curriculum!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating database:', err);
    process.exit(1);
  }
}

resetDb();
