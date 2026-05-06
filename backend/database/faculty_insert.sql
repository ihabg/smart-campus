-- Faculty Members — Computer Engineering Dept (ASCII-safe version)
-- Arabic names stored separately in application layer

INSERT INTO faculty_members (full_name, academic_title, email, department, specialization) VALUES
('Asma Afifi',            'Dr.', 'asmaafeefy@najah.edu',       'Computer Engineering', 'Computer Engineering'),
('Amjad Abu Hassan',      'Dr.', 'amjad.abuhassan@najah.edu',  'Computer Engineering', 'Computer Engineering'),
('Ashraf Armoush',        'Dr.', 'armoush@najah.edu',          'Computer Engineering', 'Computer Engineering'),
('Anas Toma',             'Dr.', 'anas.toma@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Jamal Krousheh',        'Dr.', 'jkrousheh@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Haneen Jaloudi',        'Dr.', 'haneen.jaloudi@najah.edu',   'Computer Engineering', 'Computer Engineering'),
('Hikmat Darawsheh',      'Dr.', 'hikmat.darawsheh@najah.edu', 'Computer Engineering', 'Computer Engineering'),
('Khadija Mialeh',        'Dr.', 'khdwikat@najah.edu',         'Computer Engineering', 'Computer Engineering'),
('Khalid Dawod',          'Dr.', 'khalid.dawod@najah.edu',     'Computer Engineering', 'Computer Engineering'),
('Dema Sawalha',          'Dr.', 'dema.sawalha@najah.edu',     'Computer Engineering', 'Computer Engineering'),
('Raed Al-Qadi',          'Dr.', 'alqadi@najah.edu',           'Computer Engineering', 'Computer Engineering'),
('Sufyan Samarah',        'Dr.', 'sufyan_sa@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Samer Arandi',          'Dr.', 'arandi@najah.edu',           'Computer Engineering', 'Computer Engineering'),
('Sulaiman Abu Kharmeh',  'Dr.', 'sabukharmeh@najah.edu',      'Computer Engineering', 'Computer Engineering'),
('Saad Tarapiah',         'Dr.', 's.tarapiah@najah.edu',       'Computer Engineering', 'Computer Engineering'),
('Shareef Yaseen',        'Dr.', 'shareef.yaseen@najah.edu',   'Computer Engineering', 'Computer Engineering'),
('Abdullah Rashed',       'Dr.', 'a.rashed@najah.edu',         'Computer Engineering', 'Computer Engineering'),
('Imad Natsheh',          'Dr.', 'e.natsheh@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Ala Al-Din Masri',      'Dr.', 'masri@najah.edu',            'Computer Engineering', 'Computer Engineering'),
('Ala Al-Din Abdullah',   'Dr.', 'eng_alaeddeen@najah.edu',    'Computer Engineering', 'Computer Engineering'),
('Omar Tamimi',           'Dr.', 'o.tamimi@najah.edu',         'Computer Engineering', 'Computer Engineering'),
('Falah Hassan',          'Dr.', 'fmohammed@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Kamal Saleh',           'Dr.', 'kamel.saleh@najah.edu',      'Computer Engineering', 'Computer Engineering'),
('Louay Malhis',          'Dr.', 'malhis@najah.edu',           'Computer Engineering', 'Computer Engineering'),
('Manar Qamhieh',         'Dr.', 'm.qamhieh@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Maher Khamash',         'Dr.', 'maherkh@najah.edu',          'Computer Engineering', 'Computer Engineering'),
('Muhannad Jabi',         'Dr.', 'mjabi@najah.edu',            'Computer Engineering', 'Computer Engineering'),
('Mahmoud Assad',         'Dr.', 'm_assad@najah.edu',          'Computer Engineering', 'Computer Engineering'),
('Mays Shadeed',          'Dr.', 'mays.shadeed@najah.edu',     'Computer Engineering', 'Computer Engineering'),
('Moien Omar',            'Dr.', 'moien.omar@najah.edu',       'Computer Engineering', 'Computer Engineering'),
('Naser Abu Zaid',        'Dr.', 'naserzaid@najah.edu',        'Computer Engineering', 'Computer Engineering'),
('Nuha Odeh',             'Dr.', 'nuhaodeh@najah.edu',         'Computer Engineering', 'Computer Engineering'),
('Haya Samaaneh',         'Dr.', 'hayasam@najah.edu',          'Computer Engineering', 'Computer Engineering'),
('Hanal Abu Zant',        'Dr.', 'hhanal@najah.edu',           'Computer Engineering', 'Computer Engineering'),
('Wafa Adham',            'Dr.',  NULL,                         'Computer Engineering', 'Computer Engineering'),
('Yahya Salahat',         'Dr.', 'ysaleh@najah.edu',           'Computer Engineering', 'Computer Engineering'),
('Youssef Daama',         'Dr.', 'yasdama@najah.edu',          'Computer Engineering', 'Computer Engineering')
ON CONFLICT (email) DO NOTHING;

COMMIT;
