import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@riellpedia.com';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'AdminPassword123!';

  console.log('Seeding initial admin user...');
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      email: adminEmail,
      passwordHash,
    },
  });

  console.log(`Admin user created/updated: ${admin.email}`);

  console.log('Seeding initial domains...');
  const domainList = ['pedia.biz.id', 'empruy.my.id'];
  for (const d of domainList) {
    await prisma.domain.upsert({
      where: { domain: d },
      update: { status: 'ACTIVE', verificationStatus: 'Verified' },
      create: {
        domain: d,
        status: 'ACTIVE',
        verificationStatus: 'Verified',
        mxTarget: 'in1-smtp.messagingengine.com',
      },
    });
    console.log(`Domain active & seeded: ${d}`);
  }

  const firstDomain = await prisma.domain.findFirst({ where: { status: 'ACTIVE' } });

  // Settings defaults
  const settings = [
    { key: 'mailbox_lifetime_minutes', value: '10080' }, // 7 days (1 week)
    { key: 'max_emails_per_mailbox', value: '50' },
    { key: 'max_email_size_bytes', value: '5242880' }, // 5MB
    { key: 'creation_limit_per_hour', value: '10' },
    { key: 'auto_delete_expired', value: 'true' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'default_domain_id', value: firstDomain?.id || '' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  console.log('Default settings initialized successfully.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
