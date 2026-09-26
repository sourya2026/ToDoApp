// =============================================================================
// SEED  -  demo content, also used by the admin "Reset demo data" button.
//
// NOTE ON THE COMMENTS: the brief supplied the five tickets but no comment
// text, so the dated entries below are plausible placeholders written in the
// "25/08:" style the importer understands. Replace them with the real history
// by importing your spreadsheet (Admin > Import).
// =============================================================================
import { User, Project, Item, Comment, AuditLog, ListValue } from './models/index.js';
import { hashPin } from './middleware/auth.js';
import { addComment } from './lib/comments.js';
import {
  DEFAULT_STATUSES, DEFAULT_PRIORITIES, ROLES, SECONDARY_KIND, LIST_KIND,
} from '@todo/shared';

const DEMO_PIN = '1234';

/** The sample tickets, exactly as they appear in the spreadsheet. */
const SAMPLE_ITEMS = [
  {
    ticketNumber: '8000001046',
    title: 'Sohar PR and PO Validation for Ariba users',
    priority: 'Critical',
    status: 'In Progress',
    owner: 'Radha',
    secondary: 'Team',
    comments: [
      ['2025-08-25', 'Requirement walked through with the Ariba functional team. Validation must fire on PR release and again at PO creation.'],
      ['2025-09-02', 'Draft validation rules shared with SA for review. Waiting on confirmation of the supplier category list.'],
      ['2025-09-18', 'Rules signed off. Moving to build in the development client this week.'],
    ],
  },
  {
    ticketNumber: '8000000963',
    title: 'TasHeel 2.0',
    priority: 'High',
    status: 'Pending Vendor',
    owner: 'Sourya',
    secondary: 'Team',
    comments: [
      ['2025-08-14', 'Vendor confirmed the 2.0 interface specification has changed; awaiting the revised WSDL.'],
      ['2025-09-05', 'Chased the vendor again. They expect to deliver the updated endpoint in the next release drop.'],
    ],
  },
  {
    ticketNumber: '8000001033',
    title: 'MES Notifications - New requirement',
    priority: 'Medium',
    status: 'Pending SA Review',
    owner: 'Radha',
    secondary: 'Team',
    comments: [
      ['2025-08-29', 'New notification requirement received from the MES team: alert the line supervisor when a work order is held for more than 4 hours.'],
      ['2025-09-11', 'Functional specification drafted and sent to the solution architect for review.'],
    ],
  },
  {
    ticketNumber: '8000001044',
    title: 'Configuration Request - New Leave Quota',
    priority: 'Medium',
    status: 'Pending SA for TR',
    owner: 'Sourya',
    secondary: 'Team',
    comments: [
      ['2025-09-01', 'Configuration request raised for the new leave quota type. Transport request pending SA approval.'],
    ],
  },
  {
    ticketNumber: '8000001053',
    title: 'Configuration Request - New Leave Quota',
    priority: 'Medium',
    status: 'Pending SA for TR',
    owner: 'Sourya',
    secondary: 'Team',
    comments: [
      ['2025-09-01', 'Companion ticket to 8000001046 group - second transport for the quota generation rule.'],
      ['2025-09-16', 'TR collected and attached, waiting on the SA to release it to QA.'],
    ],
  },
  {
    ticketNumber: '8000001019',
    title: 'Company Loan request: medical flag not updated',
    priority: 'Medium',
    status: 'Pending SA for CR',
    owner: 'Sourya',
    secondary: 'Venkat',
    comments: [
      ['2025-08-20', 'Reproduced: the medical indicator stays blank when a loan request is created through ESS.'],
      ['2025-09-08', 'Root cause traced to the infotype update sequence. Change request drafted for SA approval.'],
    ],
  },
];

/**
 * Wipe and rebuild the demo content.
 * Called by `npm run seed` and by the admin "Reset demo data" button.
 */
export async function seedDatabase({ log = console.log } = {}) {
  log('[seed] clearing collections');
  await Promise.all([
    User.deleteMany({}), Project.deleteMany({}), Item.deleteMany({}),
    Comment.deleteMany({}), AuditLog.deleteMany({}), ListValue.deleteMany({}),
  ]);

  // ---- dropdown lists (everything the UI offers comes from here) ---------
  log('[seed] dropdown lists');
  await ListValue.insertMany([
    ...DEFAULT_STATUSES.map((s) => ({ ...s, kind: LIST_KIND.STATUS, active: true })),
    ...DEFAULT_PRIORITIES.map((p) => ({ ...p, kind: LIST_KIND.PRIORITY, active: true })),
  ]);

  // ---- people ------------------------------------------------------------
  log('[seed] users');
  const pinHash = await hashPin(DEMO_PIN);
  const [admin, radha, sourya, venkat] = await User.create([
    { name: 'Admin', pinHash, role: ROLES.ADMIN },
    { name: 'Radha', pinHash, role: ROLES.EMPLOYEE },
    { name: 'Sourya', pinHash, role: ROLES.EMPLOYEE },
    { name: 'Venkat', pinHash, role: ROLES.EMPLOYEE },
  ]);
  const byName = new Map([['Radha', radha], ['Sourya', sourya], ['Venkat', venkat], ['Admin', admin]]);

  // ---- projects ----------------------------------------------------------
  log('[seed] projects');
  const sohar = await Project.create({
    name: 'NTT SOHAR',
    client: 'Sohar Aluminium',
    description: 'SAP support and enhancement stream for the Sohar account.',
    assignedUserIds: [radha._id, sourya._id, venkat._id],
    createdBy: admin._id,
  });

  // A second project, so "All my projects" grouping and the per-project
  // permission scoping are visible straight away on a fresh install.
  const muscat = await Project.create({
    name: 'NTT MUSCAT',
    client: 'Muscat Operations',
    description: 'Payroll and HR ticket queue for the Muscat account.',
    assignedUserIds: [sourya._id],
    createdBy: admin._id,
  });

  // ---- tickets and their comment history --------------------------------
  log('[seed] items and comments');
  for (const sample of SAMPLE_ITEMS) {
    const owner = byName.get(sample.owner) || radha;
    const secondaryUser = sample.secondary !== 'Team' ? byName.get(sample.secondary) : null;

    const item = await Item.create({
      projectId: sohar._id,
      ticketNumber: sample.ticketNumber,
      title: sample.title,
      priority: sample.priority,
      status: sample.status,
      ownerId: owner._id,
      secondaryKind: secondaryUser ? SECONDARY_KIND.USER : SECONDARY_KIND.TEAM,
      secondaryUserId: secondaryUser ? secondaryUser._id : null,
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Each dated line becomes its own history entry, oldest first.
    for (const [date, text] of sample.comments) {
      await addComment({
        itemId: item._id,
        text,
        authorId: owner._id,
        at: new Date(date + 'T09:00:00Z'),
      });
    }

    await AuditLog.create({
      itemId: item._id, projectId: sohar._id, field: 'created',
      fieldLabel: 'Item created', oldValue: '',
      newValue: sample.ticketNumber + ' - ' + sample.title,
      changedBy: admin._id, at: new Date(sample.comments[0][0] + 'T08:55:00Z'),
    });
  }

  // One ticket on the second project, owned by Sourya.
  const muscatItem = await Item.create({
    projectId: muscat._id,
    ticketNumber: '8000002001',
    title: 'Payroll posting run fails for Oman social insurance',
    priority: 'High',
    status: 'New',
    ownerId: sourya._id,
    secondaryKind: SECONDARY_KIND.TEAM,
    createdBy: admin._id,
    updatedBy: admin._id,
  });
  await addComment({
    itemId: muscatItem._id,
    text: 'Logged by the payroll team after the September run. Awaiting a full error log.',
    authorId: sourya._id,
    at: new Date('2025-09-22T09:00:00Z'),
  });

  const counts = {
    users: await User.countDocuments(),
    projects: await Project.countDocuments(),
    items: await Item.countDocuments(),
    comments: await Comment.countDocuments(),
  };
  log('[seed] done', counts);
  return counts;
}
