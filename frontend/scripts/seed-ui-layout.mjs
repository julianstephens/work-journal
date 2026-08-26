import PocketBase from 'pocketbase';

const COLLECTIONS = {
  projects: 'work_journal_projects',
  tasks: 'work_journal_tasks',
  dailyTasks: 'work_journal_daily_tasks',
};

const SEED_PROJECT_PREFIX = 'UI Seed - ';
const SEED_TASK_PREFIX = '[seed-ui]';

const PB_URL = process.env.PB_URL ?? 'http://127.0.0.1:8090';
const PB_EMAIL = process.env.PB_EMAIL;
const PB_PASSWORD = process.env.PB_PASSWORD;

if (!PB_EMAIL || !PB_PASSWORD) {
  console.error('Missing credentials. Set PB_EMAIL and PB_PASSWORD before running this script.');
  console.error('Example: PB_EMAIL=you@example.com PB_PASSWORD=secret pnpm run seed:ui');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const projectsToSeed = [
  {
    name: `${SEED_PROJECT_PREFIX}Platform Revamp`,
    description: 'Visual hierarchy, cards, and spacing experiments for the main platform pages.',
    taskTree: [
      {
        title: 'Map current information architecture',
        children: [
          {
            title: 'Inventory nav entry points',
            children: [
              { title: 'Compare desktop vs mobile paths' },
              { title: 'Flag redundant routes' },
            ],
          },
          { title: 'Document page ownership matrix' },
        ],
      },
      {
        title: 'Explore dashboard density options',
        children: [
          { title: 'Prototype compact mode' },
          { title: 'Prototype readable mode' },
        ],
      },
      {
        title: 'Refine card component tokens',
        children: [
          {
            title: 'Align elevation tokens',
            children: [
              { title: 'Calibrate hover shadow steps' },
            ],
          },
          { title: 'Normalize spacing scale usage' },
        ],
      },
      { title: 'Build alternate sidebar patterns' },
      { title: 'Create typography scale samples' },
    ],
  },
  {
    name: `${SEED_PROJECT_PREFIX}Mobile UX Polish`,
    description: 'Mobile-first task flows, navigation behavior, and list interaction polish.',
    taskTree: [
      {
        title: 'Audit gesture interactions',
        children: [
          { title: 'List gesture conflicts by screen' },
          {
            title: 'Trace swipe failures',
            children: [
              { title: 'Capture repro videos' },
              { title: 'Attach expected behavior notes' },
            ],
          },
        ],
      },
      {
        title: 'Prototype compact nav patterns',
        children: [
          { title: 'Bottom nav with overflow tray' },
          { title: 'Floating action rail concept' },
        ],
      },
      { title: 'Tune touch target sizes' },
      { title: 'Test keyboard + input states' },
      {
        title: 'Draft responsive breakpoints',
        children: [
          { title: 'Validate 360/390/414 layouts' },
        ],
      },
    ],
  },
  {
    name: `${SEED_PROJECT_PREFIX}Design System Docs`,
    description: 'Foundational docs and examples for reusable components and patterns.',
    taskTree: [
      {
        title: 'Document button variants',
        children: [
          { title: 'Primary/secondary usage table' },
          { title: 'Disabled/loading states' },
        ],
      },
      {
        title: 'Add form field guidance',
        children: [
          {
            title: 'Validation message patterns',
            children: [
              { title: 'Error tone examples' },
              { title: 'Success microcopy examples' },
            ],
          },
        ],
      },
      { title: 'Write color usage rules' },
      { title: 'Capture empty state examples' },
      { title: 'Draft component naming conventions' },
    ],
  },
  {
    name: `${SEED_PROJECT_PREFIX}Analytics Workspace`,
    description: 'Chart layout exploration and content prioritization for analytics screens.',
    taskTree: [
      {
        title: 'Design metric strip variants',
        children: [
          { title: 'Compact KPI cards' },
          { title: 'Narrative KPI cards' },
        ],
      },
      {
        title: 'Prototype table + chart split view',
        children: [
          {
            title: 'Resizable panes interaction',
            children: [
              { title: 'Persist user pane ratio' },
            ],
          },
          { title: 'Cross-highlight rows from chart' },
        ],
      },
      { title: 'Evaluate chart legends and labels' },
      { title: 'Define alert and threshold styles' },
      { title: 'Validate trendline readability' },
    ],
  },
  {
    name: `${SEED_PROJECT_PREFIX}Marketing Site Sprint`,
    description: 'Landing page sections, narrative flow, and call-to-action treatment.',
    taskTree: [
      {
        title: 'Sketch hero section concepts',
        children: [
          { title: 'Message-first hero option' },
          { title: 'Product-visual hero option' },
        ],
      },
      {
        title: 'Build testimonial component',
        children: [
          { title: 'Card carousel variant' },
          {
            title: 'Editorial quote variant',
            children: [
              { title: 'Author profile metadata row' },
            ],
          },
        ],
      },
      { title: 'Draft pricing comparison layout' },
      { title: 'Test CTA contrast options' },
      { title: 'Polish footer information layout' },
    ],
  },
];

const inboxTasks = [
  'Collect layout inspiration references',
  'Review component spacing checklist',
  'Capture before/after screenshots',
  'Write daily UI iteration notes',
  'Prepare next usability test script',
];

function todayDateOnlyIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day} 00:00:00.000Z`;
}

async function listAll(collectionName, opts = {}) {
  return pb.collection(collectionName).getFullList({
    ...opts,
  });
}

async function cleanupSeedData() {
  const [projects, tasks] = await Promise.all([
    listAll(COLLECTIONS.projects),
    listAll(COLLECTIONS.tasks),
  ]);

  let dailyTasks = [];
  try {
    dailyTasks = await listAll(COLLECTIONS.dailyTasks);
  } catch {
    console.warn('Skipping daily task cleanup (collection unavailable or invalid).');
  }

  const seededProjectIds = new Set(
    projects
      .filter((project) => project.name?.startsWith(SEED_PROJECT_PREFIX))
      .map((project) => project.id),
  );

  const seededTaskIds = new Set(
    tasks
      .filter((task) => task.title?.startsWith(SEED_TASK_PREFIX) || (task.project && seededProjectIds.has(task.project)))
      .map((task) => task.id),
  );

  const dailyToDelete = dailyTasks.filter((daily) => seededTaskIds.has(daily.task)).map((daily) => daily.id);
  const tasksToDelete = [...seededTaskIds];
  const projectsToDelete = [...seededProjectIds];

  await Promise.all(dailyToDelete.map((id) => pb.collection(COLLECTIONS.dailyTasks).delete(id)));
  await Promise.all(tasksToDelete.map((id) => pb.collection(COLLECTIONS.tasks).delete(id)));
  await Promise.all(projectsToDelete.map((id) => pb.collection(COLLECTIONS.projects).delete(id)));

  console.log(`Removed old seed data: ${projectsToDelete.length} projects, ${tasksToDelete.length} tasks, ${dailyToDelete.length} today items.`);
}

async function createProjectWithTasks(userId, projectSeed, projectPosition) {
  const project = await pb.collection(COLLECTIONS.projects).create({
    user: userId,
    name: projectSeed.name,
    description: projectSeed.description,
    archived: false,
    position: projectPosition,
  });

  const createdTasks = [];

  async function createTreeNodes(nodes, parentId = null, depth = 0) {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const done = Boolean(node.completed ?? (depth === 0 && i % 5 === 0));

      const task = await pb.collection(COLLECTIONS.tasks).create({
        user: userId,
        title: `${SEED_TASK_PREFIX} ${node.title}`,
        project: project.id,
        parent: parentId,
        completed: done,
        completed_at: done ? new Date().toISOString() : null,
        position: i,
      });

      createdTasks.push(task);

      if (node.children?.length) {
        await createTreeNodes(node.children, task.id, depth + 1);
      }
    }
  }

  await createTreeNodes(projectSeed.taskTree);

  return { project, tasks: createdTasks };
}

async function seed() {
  await pb.collection('users').authWithPassword(PB_EMAIL, PB_PASSWORD);

  const userId = pb.authStore.record?.id;
  if (!userId) {
    throw new Error('Authenticated user id not found.');
  }

  console.log(`Authenticated as ${PB_EMAIL}.`);
  await cleanupSeedData();

  const seededTasks = [];

  for (let i = 0; i < projectsToSeed.length; i += 1) {
    const result = await createProjectWithTasks(userId, projectsToSeed[i], i);
    seededTasks.push(...result.tasks);
  }

  for (let i = 0; i < inboxTasks.length; i += 1) {
    const task = await pb.collection(COLLECTIONS.tasks).create({
      user: userId,
      title: `${SEED_TASK_PREFIX} ${inboxTasks[i]}`,
      project: null,
      parent: null,
      completed: false,
      position: i,
    });

    seededTasks.push(task);
  }

  const today = todayDateOnlyIso();
  const todaySample = seededTasks.slice(0, 8);

  try {
    for (let i = 0; i < todaySample.length; i += 1) {
      await pb.collection(COLLECTIONS.dailyTasks).create({
        user: userId,
        date: today,
        task: todaySample[i].id,
        position: i,
      });
    }
    console.log(`Added ${todaySample.length} items to Today for ${today}.`);
  } catch {
    console.warn('Skipping Today seeding (daily tasks collection unavailable or invalid).');
  }

  console.log(`Created ${projectsToSeed.length} projects.`);
  console.log(`Created ${seededTasks.length} tasks (${inboxTasks.length} inbox tasks).`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
