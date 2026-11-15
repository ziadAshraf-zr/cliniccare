/**
 * بيانات اصطناعية فقط — لا بيانات مرضى حقيقية إطلاقًا (القسم 4 من الخطة
 * التقنية). كل الأسماء والهواتف والتواريخ مولّدة بـ faker بنمط واضح الزيف.
 *
 * التشغيل: pnpm db:seed (بعد pnpm db:migrate و pnpm gen:prisma).
 */
import 'dotenv/config';
import { PrismaClient, Sex, UserRole, AppointmentStatus, EncounterStatus } from '@prisma/client';
import { fakerAR as faker } from '@faker-js/faker';
import * as argon2 from 'argon2';
import { MEDICATIONS_CATALOG } from './data/medications';
import { ICD10_CODES } from './data/icd10';

const prisma = new PrismaClient();

/** كلمة مرور موحدة لكل حسابات العرض التجريبي فقط — لا تُستخدم في أي بيئة حقيقية. */
const DEMO_PASSWORD = 'Passw0rd!2026';
const CLINIC_ID = process.env.DEFAULT_CLINIC_ID ?? '00000000-0000-4000-8000-000000000001';

function uuid(seed: string): string {
  // معرّفات ثابتة وقابلة لإعادة الإنتاج لحسابات العرض الأساسية، لتسهيل كتابة
  // اختبارات E2E وسيناريو العرض دون قراءة الـ id من الاستجابة أولًا.
  return `00000000-0000-4000-9000-${seed.padStart(12, '0')}`;
}

function demoPhone(i: number): string {
  // نمط واضح الزيف ومتسلسل (القسم 4): +20 100000 + رقمان للمجموعة + 3 للتسلسل.
  return `+20100000${String(i).padStart(4, '0')}`;
}

async function hashDemoPassword() {
  return argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2 });
}

async function main() {
  console.log('🌱 بدء تعبئة بيانات ClinicCare التجريبية...');
  const passwordHash = await hashDemoPassword();

  // ===================== العيادة =====================
  await prisma.clinic.upsert({
    where: { id: CLINIC_ID },
    update: {},
    create: { id: CLINIC_ID, name: 'عيادة النموذج الأكاديمي', timezone: 'Africa/Cairo', isDemo: true },
  });

  // ===================== المستخدمون الإداريون =====================
  const admin = await createUserWithRole({
    id: uuid('1'),
    email: 'admin@cliniccare.demo',
    role: UserRole.ADMIN,
    passwordHash,
  });

  const receptionists = await Promise.all(
    [1, 2].map((i) =>
      createUserWithRole({
        id: uuid(`2${i}`),
        email: `reception${i}@cliniccare.demo`,
        role: UserRole.RECEPTIONIST,
        passwordHash,
      }),
    ),
  );

  // ===================== الأطباء =====================
  const specialties = ['باطنة عامة', 'طب أسرة', 'أطفال'];
  const doctors = [];
  for (let i = 0; i < 3; i++) {
    const user = await createUserWithRole({
      id: uuid(`3${i}`),
      email: `doctor${i + 1}@cliniccare.demo`,
      role: UserRole.DOCTOR,
      passwordHash,
    });
    const practitioner = await prisma.practitioner.upsert({
      where: { id: uuid(`4${i}`) },
      update: {},
      create: {
        id: uuid(`4${i}`),
        userId: user.id,
        specialty: specialties[i],
        licenseNo: `DEMO-LIC-${1000 + i}`,
        defaultSlotMinutes: 20,
      },
    });
    // ساعات العمل: الأحد للخميس 9:00 - 17:00 (القسم 2 و7.1)
    for (let weekday = 0; weekday <= 4; weekday++) {
      await prisma.workingHours.upsert({
        where: { id: uuid(`5${i}${weekday}`) },
        update: {},
        create: {
          id: uuid(`5${i}${weekday}`),
          practitionerId: practitioner.id,
          weekday,
          startTime: new Date('1970-01-01T09:00:00Z'),
          endTime: new Date('1970-01-01T17:00:00Z'),
        },
      });
    }
    doctors.push(practitioner);
  }

  // مثال توضيحي لإجازة طبيب عبر $executeRaw (range غير مدعوم تصريحيًا في Prisma،
  // القسم 4 و15). ليوم واحد بعد أسبوعين من اليوم الحالي.
  const vacationStart = addDays(new Date(), 14);
  const vacationEnd = addDays(new Date(), 15);
  await prisma.$executeRaw`
    INSERT INTO "time_off" ("id", "practitioner_id", "range", "reason")
    VALUES (${uuid('600')}::uuid, ${doctors[0].id}::uuid,
            tstzrange(${vacationStart}::timestamptz, ${vacationEnd}::timestamptz, '[)'), 'إجازة سنوية')
    ON CONFLICT ("id") DO NOTHING
  `;

  // ===================== الخدمات =====================
  const serviceDefs = [
    { nameAr: 'كشف عام', nameEn: 'General Consultation', durationMinutes: 20, priceCents: 15000 },
    { nameAr: 'كشف متابعة', nameEn: 'Follow-up Visit', durationMinutes: 15, priceCents: 10000 },
    { nameAr: 'استشارة أطفال', nameEn: 'Pediatric Consultation', durationMinutes: 20, priceCents: 15000 },
    { nameAr: 'فحص دوري', nameEn: 'Routine Checkup', durationMinutes: 30, priceCents: 20000 },
  ];
  const services = [];
  for (let i = 0; i < serviceDefs.length; i++) {
    services.push(
      await prisma.service.upsert({
        where: { id: uuid(`7${i}`) },
        update: {},
        create: { id: uuid(`7${i}`), clinicId: CLINIC_ID, ...serviceDefs[i] },
      }),
    );
  }

  // ===================== كتالوج الأدوية =====================
  const medications = [];
  for (let i = 0; i < MEDICATIONS_CATALOG.length; i++) {
    medications.push(
      await prisma.medicationCatalogItem.upsert({
        where: { id: uuid(`8${String(i).padStart(2, '0')}`) },
        update: {},
        create: { id: uuid(`8${String(i).padStart(2, '0')}`), ...MEDICATIONS_CATALOG[i] },
      }),
    );
  }

  // ===================== نصوص الموافقات =====================
  // نصوص تعليمية لعرض آلية الإصدار فقط، ولا قيمة قانونية لها (القسم 10 و15:
  // "مراجعة قانونية لنصوص الموافقة" قرار مفتوح بانتظار المشرف/مختص).
  const consentTexts = [
    {
      purpose: 'PORTAL_ACCESS' as const,
      bodyAr: 'بالموافقة، يوافق المريض على إنشاء حساب في بوابة المريض الإلكترونية والاطلاع على بياناته الطبية المنشورة من خلالها. [نص تعليمي لمشروع تخرج، لا قيمة قانونية له.]',
      bodyEn: 'By consenting, the patient agrees to create a patient-portal account and view their published medical data through it. [Educational text for an academic project; not legally binding.]',
    },
    {
      purpose: 'EMAIL_NOTIFICATIONS' as const,
      bodyAr: 'بالموافقة، يوافق المريض على استقبال إشعارات محايدة بالبريد الإلكتروني (تأكيد موعد، تذكير، توفر مستند) دون محتوى طبي. [نص تعليمي.]',
      bodyEn: 'By consenting, the patient agrees to receive neutral email notifications (appointment confirmation, reminder, document availability) with no clinical content. [Educational text.]',
    },
    {
      purpose: 'DATA_EXPORT' as const,
      bodyAr: 'بالموافقة، يوافق المريض على إمكانية تصدير بياناته الطبية النهائية بصيغة FHIR عند الطلب. [نص تعليمي.]',
      bodyEn: 'By consenting, the patient agrees that their finalized medical data may be exported in FHIR format on request. [Educational text.]',
    },
  ];
  for (const ct of consentTexts) {
    await prisma.consentText.upsert({
      where: { purpose_version: { purpose: ct.purpose, version: 1 } },
      update: {},
      create: { purpose: ct.purpose, version: 1, bodyAr: ct.bodyAr, bodyEn: ct.bodyEn },
    });
  }

  // ===================== المرضى =====================
  const PATIENT_COUNT = 40;
  const patients = [];
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const sex = faker.helpers.arrayElement([Sex.MALE, Sex.FEMALE]);
    const fullName = sex === Sex.MALE ? faker.person.fullName({ sex: 'male' }) : faker.person.fullName({ sex: 'female' });
    const patient = await prisma.patient.upsert({
      where: { id: uuid(`9${String(i).padStart(3, '0')}`) },
      update: {},
      create: {
        id: uuid(`9${String(i).padStart(3, '0')}`),
        clinicId: CLINIC_ID,
        medicalRecordNo: `MRN-${String(i + 1).padStart(6, '0')}`,
        fullName,
        dob: faker.date.birthdate({ min: 1945, max: 2018, mode: 'year' }),
        sex,
        phoneE164: demoPhone(i),
        email: faker.datatype.boolean(0.4) ? faker.internet.email({ firstName: 'patient', lastName: String(i) }) : null,
        address: faker.location.streetAddress(),
        emergencyContactName: faker.person.fullName(),
        emergencyContactPhone: demoPhone(900 + i),
        isDemo: true,
      },
    });
    patients.push(patient);

    // حساسية عشوائية لربع المرضى تقريبًا، لقياس عرضها في ملخص الطبيب.
    if (faker.datatype.boolean(0.25)) {
      await prisma.allergy.upsert({
        where: { id: uuid(`A${String(i).padStart(3, '0')}`) },
        update: {},
        create: {
          id: uuid(`A${String(i).padStart(3, '0')}`),
          patientId: patient.id,
          substance: faker.helpers.arrayElement(['البنسلين', 'الأسبرين', 'اللاكتوز', 'المكسرات', 'الغبار']),
          reaction: faker.helpers.arrayElement(['طفح جلدي', 'ضيق تنفس', 'انتفاخ', 'صداع']),
          severity: faker.helpers.arrayElement(['MILD', 'MODERATE', 'SEVERE'] as const),
          recordedBy: admin.id,
        },
      });
    }
  }
  // مزامنة عداد رقم الملف الطبي بعد التعبئة المباشرة (القسم 4).
  await prisma.clinicCounter.upsert({
    where: { clinicId_name: { clinicId: CLINIC_ID, name: 'mrn' } },
    update: { nextValue: PATIENT_COUNT + 1 },
    create: { clinicId: CLINIC_ID, name: 'mrn', nextValue: PATIENT_COUNT + 1 },
  });

  // حسابان جاهزان للبوابة (القسم 5: ربط حساب المريض بملفه).
  for (const [idx, patient] of [patients[0], patients[1]].entries()) {
    const portalUser = await createUserWithRole({
      id: uuid(`B${idx}`),
      email: `patient${idx + 1}@cliniccare.demo`,
      role: UserRole.PATIENT,
      passwordHash,
    });
    await prisma.patientAccount.upsert({
      where: { userId: portalUser.id },
      update: {},
      create: { userId: portalUser.id, patientId: patient.id },
    });
    for (const purpose of ['PORTAL_ACCESS', 'EMAIL_NOTIFICATIONS'] as const) {
      await prisma.consent.upsert({
        where: { id: uuid(`C${idx}${purpose === 'PORTAL_ACCESS' ? '1' : '2'}`) },
        update: {},
        create: {
          id: uuid(`C${idx}${purpose === 'PORTAL_ACCESS' ? '1' : '2'}`),
          patientId: patient.id,
          purpose,
          textVersion: 1,
          method: 'PORTAL',
        },
      });
    }
  }

  // ===================== المواعيد والزيارات =====================
  // فتحات زمنية متتالية (غير متقاطعة بالبناء) لكل طبيب على مدار أسبوعين
  // ماضيين وأسبوعين قادمين، ثم اختيار عشوائي منها للمواعيد — بلا أي تعارض
  // محتمل مع Exclusion constraint (appointments_no_overlap، القسم 4).
  const allSlots: { practitionerId: string; startAt: Date; endAt: Date }[] = [];
  for (const doctor of doctors) {
    for (let dayOffset = -14; dayOffset <= 14; dayOffset++) {
      const day = addDays(new Date(), dayOffset);
      if (![0, 1, 2, 3, 4].includes(day.getUTCDay())) continue; // الأحد-الخميس فقط
      let slotStart = atLocalTime(day, 9, 0);
      const dayEnd = atLocalTime(day, 17, 0);
      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + 20 * 60_000);
        allSlots.push({ practitionerId: doctor.id, startAt: new Date(slotStart), endAt: slotEnd });
        slotStart = slotEnd;
      }
    }
  }
  const chosenSlots = faker.helpers.arrayElements(allSlots, 120);

  let completedCount = 0;
  const TARGET_COMPLETED = 30;
  for (let i = 0; i < chosenSlots.length; i++) {
    const slot = chosenSlots[i];
    const patient = faker.helpers.arrayElement(patients);
    const service = faker.helpers.arrayElement(services);
    const isPast = slot.startAt.getTime() < Date.now();

    let status: AppointmentStatus;
    if (isPast && completedCount < TARGET_COMPLETED) {
      status = AppointmentStatus.COMPLETED;
      completedCount++;
    } else if (isPast) {
      status = faker.helpers.arrayElement([AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW]);
    } else {
      status = faker.helpers.arrayElement([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]);
    }

    const appointment = await prisma.appointment.create({
      data: {
        clinicId: CLINIC_ID,
        patientId: patient.id,
        practitionerId: slot.practitionerId,
        serviceId: service.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        status,
        cancelReason: status === AppointmentStatus.CANCELLED ? 'طلب المريض تأجيل الموعد' : null,
        checkedInAt: status === AppointmentStatus.COMPLETED ? slot.startAt : null,
      },
    });

    if (status === AppointmentStatus.COMPLETED) {
      await createSignedEncounter({ appointment, patientId: patient.id, doctorId: appointment.practitionerId, medications });
    }
  }

  console.log('✅ تمت التعبئة: عيادة واحدة، 3 أطباء، 2 استقبال، 1 مدير،');
  console.log(`   ${PATIENT_COUNT} مريضًا، ${chosenSlots.length} موعدًا (${completedCount} منها زيارات معتمدة)،`);
  console.log(`   ${medications.length} دواءً في الكتالوج، ${ICD10_CODES.length} كود ICD-10.`);
  console.log(`🔑 كلمة مرور كل حسابات العرض: ${DEMO_PASSWORD}`);
  console.log(`   admin@cliniccare.demo · reception1@cliniccare.demo · doctor1@cliniccare.demo · patient1@cliniccare.demo`);
}

// ===================== دوال مساعدة =====================

async function createUserWithRole(args: { id: string; email: string; role: UserRole; passwordHash: string }) {
  const user = await prisma.user.upsert({
    where: { id: args.id },
    update: {},
    create: {
      id: args.id,
      clinicId: CLINIC_ID,
      email: args.email,
      passwordHash: args.passwordHash,
      isDemo: true,
    },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: args.role } },
    update: {},
    create: { userId: user.id, role: args.role },
  });
  return user;
}

async function createSignedEncounter(args: {
  appointment: { id: string };
  patientId: string;
  doctorId: string;
  medications: { id: string }[];
}) {
  const diagnosisPool = faker.helpers.arrayElements(ICD10_CODES, faker.number.int({ min: 1, max: 2 }));
  const signedAt = new Date();

  const encounter = await prisma.encounter.create({
    data: {
      clinicId: CLINIC_ID,
      patientId: args.patientId,
      practitionerId: args.doctorId,
      appointmentId: args.appointment.id,
      status: EncounterStatus.SIGNED,
      chiefComplaint: faker.helpers.arrayElement(['صداع منذ يومين', 'سعال وبلغم', 'ألم في المعدة', 'متابعة دورية', 'حمى خفيفة']),
      history: 'لا يوجد تاريخ مرضي مزمن مسجل غير ما هو موثق في ملف المريض.',
      examination: 'الفحص السريري العام ضمن الطبيعي، لا علامات تحذيرية.',
      assessment: diagnosisPool.map((d) => d.ar).join('، '),
      plan: 'راحة، سوائل كافية، ومراجعة العيادة إذا استمرت الأعراض أكثر من 5 أيام.',
      signedAt,
      signedBy: args.doctorId,
    },
  });

  await prisma.vital.createMany({
    data: [
      { encounterId: encounter.id, patientId: args.patientId, code: '8480-6', valueNumeric: faker.number.int({ min: 100, max: 135 }), unit: 'mm[Hg]', recordedBy: args.doctorId },
      { encounterId: encounter.id, patientId: args.patientId, code: '8462-6', valueNumeric: faker.number.int({ min: 60, max: 90 }), unit: 'mm[Hg]', recordedBy: args.doctorId },
      { encounterId: encounter.id, patientId: args.patientId, code: '8867-4', valueNumeric: faker.number.int({ min: 60, max: 100 }), unit: '/min', recordedBy: args.doctorId },
      { encounterId: encounter.id, patientId: args.patientId, code: '8310-5', valueNumeric: faker.number.float({ min: 36.3, max: 38.5, fractionDigits: 1 }), unit: 'Cel', recordedBy: args.doctorId },
    ],
  });

  for (const d of diagnosisPool) {
    await prisma.diagnosis.create({
      data: { encounterId: encounter.id, patientId: args.patientId, icd10Code: d.code, displayAr: d.ar, displayEn: d.en },
    });
  }

  if (faker.datatype.boolean(0.7)) {
    const prescription = await prisma.prescription.create({
      data: { encounterId: encounter.id, patientId: args.patientId, status: 'ISSUED', issuedAt: signedAt },
    });
    const items = faker.helpers.arrayElements(args.medications, faker.number.int({ min: 1, max: 3 }));
    for (const med of items) {
      await prisma.prescriptionItem.create({
        data: {
          prescriptionId: prescription.id,
          medicationId: med.id,
          doseText: faker.helpers.arrayElement(['قرص واحد', 'نصف قرص', 'قرصان', 'كبسولة واحدة']),
          route: 'فموي',
          frequency: faker.helpers.arrayElement(['مرة يوميًا', 'مرتين يوميًا', 'كل 8 ساعات', 'عند اللزوم']),
          durationDays: faker.number.int({ min: 3, max: 14 }),
          instructions: 'بعد الأكل مباشرة.',
        },
      });
    }
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** يبني وقتًا بالساعة واليوم المعطى بتوقيت Africa/Cairo تقريبًا (UTC+2 ثابت لبيانات العرض فقط). */
function atLocalTime(day: Date, hours: number, minutes: number): Date {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours - 2, minutes, 0));
  return d;
}

main()
  .catch((e) => {
    console.error('❌ فشلت التعبئة:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
