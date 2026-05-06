-- ═══════════════════════════════════════════════════════════
-- FACULTY MEMBERS — Computer Engineering Department
-- An-Najah National University
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS faculty_members (
  id             SERIAL PRIMARY KEY,
  full_name      VARCHAR(150) NOT NULL,
  full_name_ar   VARCHAR(150),
  academic_title VARCHAR(50)  NOT NULL DEFAULT 'Dr.',
  email          VARCHAR(150) UNIQUE,
  department     VARCHAR(100) NOT NULL DEFAULT 'Computer Engineering',
  specialization VARCHAR(200),
  office         VARCHAR(50),
  office_room_id UUID REFERENCES rooms(id),
  image_url      VARCHAR(300),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_dept  ON faculty_members(department);
CREATE INDEX IF NOT EXISTS idx_faculty_email ON faculty_members(email);

-- ── Insert all Computer Engineering faculty ─────────────────
INSERT INTO faculty_members (full_name, full_name_ar, academic_title, email, department, specialization) VALUES
  ('Asma Afifi',        'أسماء عفيفي',         'Dr.', 'asmaafeefy@najah.edu',       'Computer Engineering', 'Computer Engineering'),
  ('Amjad Abu Hassan',  'أمجد أبو حسان',       'Dr.', 'amjad.abuhassan@najah.edu',  'Computer Engineering', 'Computer Engineering'),
  ('Ashraf Armoush',    'أشرف عرموش',          'Dr.', 'armoush@najah.edu',          'Computer Engineering', 'Computer Engineering'),
  ('Anas Toma',         'أنس طعمة',            'Dr.', 'anas.toma@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Jamal Krousheh',    'جمال خروشة',          'Dr.', 'jkrousheh@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Haneen Jaloudi',    'حنين العط',           'Dr.', 'haneen.jaloudi@najah.edu',   'Computer Engineering', 'Computer Engineering'),
  ('Hikmat Darawsheh',  'حكمت درواشه',         'Dr.', 'hikmat.darawsheh@najah.edu', 'Computer Engineering', 'Computer Engineering'),
  ('Khadija Mialeh',    'خديجة ميالة',         'Dr.', 'khdwikat@najah.edu',         'Computer Engineering', 'Computer Engineering'),
  ('Khalid Dawod',      'خالد داوود',          'Dr.', 'khalid.dawod@najah.edu',     'Computer Engineering', 'Computer Engineering'),
  ('Dema Sawalha',      'ديمة صوالحة',         'Dr.', 'dema.sawalha@najah.edu',     'Computer Engineering', 'Computer Engineering'),
  ('Raed Al-Qadi',      'رائد القاضي',         'Dr.', 'alqadi@najah.edu',           'Computer Engineering', 'Computer Engineering'),
  ('Sufyan Samarah',    'سفيان سمارة',         'Dr.', 'sufyan_sa@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Samer Arandi',      'سامر العرندي',        'Dr.', 'arandi@najah.edu',           'Computer Engineering', 'Computer Engineering'),
  ('Sulaiman Abu Kharmeh','سليمان أبو خرمة',  'Dr.', 'sabukharmeh@najah.edu',      'Computer Engineering', 'Computer Engineering'),
  ('Saad Tarapiah',     'سعد طربية',           'Dr.', 's.tarapiah@najah.edu',       'Computer Engineering', 'Computer Engineering'),
  ('Shareef Yaseen',    'شريف ياسين',          'Dr.', 'shareef.yaseen@najah.edu',   'Computer Engineering', 'Computer Engineering'),
  ('Abdullah Rashed',   'عبد الله راشد',       'Dr.', 'a.rashed@najah.edu',         'Computer Engineering', 'Computer Engineering'),
  ('Imad Natsheh',      'عماد النتشة',         'Dr.', 'e.natsheh@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Ala Al-Din Masri',  'علاء الدين المصري',  'Dr.', 'masri@najah.edu',            'Computer Engineering', 'Computer Engineering'),
  ('Ala Al-Din Abdullah','علاء الدين عبد الله','Dr.', 'eng_alaeddeen@najah.edu',    'Computer Engineering', 'Computer Engineering'),
  ('Omar Tamimi',       'عمر التميمي',         'Dr.', 'o.tamimi@najah.edu',         'Computer Engineering', 'Computer Engineering'),
  ('Falah Hassan',      'فلاح حسن',            'Dr.', 'fmohammed@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Kamal Saleh',       'كمال صالح',           'Dr.', 'kamel.saleh@najah.edu',      'Computer Engineering', 'Computer Engineering'),
  ('Louay Malhis',      'لؤي ملحيس',           'Dr.', 'malhis@najah.edu',           'Computer Engineering', 'Computer Engineering'),
  ('Manar Qamhieh',     'منار قمحية',          'Dr.', 'm.qamhieh@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Maher Khamash',     'ماهر الخماش',         'Dr.', 'maherkh@najah.edu',          'Computer Engineering', 'Computer Engineering'),
  ('Muhannad Jabi',     'مهند الجابي',         'Dr.', 'mjabi@najah.edu',            'Computer Engineering', 'Computer Engineering'),
  ('Mahmoud Assad',     'محمود أسعد',          'Dr.', 'm_assad@najah.edu',          'Computer Engineering', 'Computer Engineering'),
  ('Mays Shadeed',      'ميس شديد',            'Dr.', 'mays.shadeed@najah.edu',     'Computer Engineering', 'Computer Engineering'),
  ('Moien Omar',        'معين عمر',            'Dr.', 'moien.omar@najah.edu',       'Computer Engineering', 'Computer Engineering'),
  ('Naser Abu Zaid',    'ناصر أبو زيد',        'Dr.', 'naserzaid@najah.edu',        'Computer Engineering', 'Computer Engineering'),
  ('Nuha Odeh',         'نهى عودة',            'Dr.', 'nuhaodeh@najah.edu',         'Computer Engineering', 'Computer Engineering'),
  ('Haya Samaaneh',     'هيا سماعنة',          'Dr.', 'hayasam@najah.edu',          'Computer Engineering', 'Computer Engineering'),
  ('Hanal Abu Zant',    'هنال أبو زنط',        'Dr.', 'hhanal@najah.edu',           'Computer Engineering', 'Computer Engineering'),
  ('Wafa Adham',        'وفا أدهم',            'Dr.',  NULL,                         'Computer Engineering', 'Computer Engineering'),
  ('Yahya Salahat',     'يحيى صلاحات',         'Dr.', 'ysaleh@najah.edu',           'Computer Engineering', 'Computer Engineering'),
  ('Youssef Daama',     'يوسف دعمة',           'Dr.', 'yasdama@najah.edu',          'Computer Engineering', 'Computer Engineering')
ON CONFLICT (email) DO NOTHING;

COMMIT;
