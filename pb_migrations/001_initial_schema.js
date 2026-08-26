migrate((app) => {
  const COLLECTION_IDS = {
    projects: 'wjprojects00001',
    tasks: 'wjtasks00000001',
    notes: 'wjnotes00000001',
    dailyTasks: 'wjdailytasks001',
  }

  const users = app.findCollectionByNameOrId('_pb_users_auth_')

  const specs = [
    {
      id: COLLECTION_IDS.projects,
      name: 'work_journal_projects',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { maxSelect: 1, collectionId: users.id } },
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text', required: false },
        { name: 'archived', type: 'bool', required: true, options: { default: false } },
        { name: 'position', type: 'number', required: true, options: { default: 0 } },
      ],
      indexes: [],
    },
    {
      id: COLLECTION_IDS.tasks,
      name: 'work_journal_tasks',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { maxSelect: 1, collectionId: users.id } },
        { name: 'project', type: 'relation', required: false, options: { maxSelect: 1, collectionId: COLLECTION_IDS.projects } },
        { name: 'parent', type: 'relation', required: false, options: { maxSelect: 1, collectionId: COLLECTION_IDS.tasks } },
        { name: 'title', type: 'text', required: true },
        { name: 'completed', type: 'bool', required: true, options: { default: false } },
        { name: 'position', type: 'number', required: true, options: { default: 0 } },
        { name: 'completed_at', type: 'date', required: false },
      ],
      indexes: [],
    },
    {
      id: COLLECTION_IDS.notes,
      name: 'work_journal_notes',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { maxSelect: 1, collectionId: users.id } },
        { name: 'project', type: 'relation', required: true, options: { maxSelect: 1, collectionId: COLLECTION_IDS.projects } },
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'text', required: true },
      ],
      indexes: [],
    },
    {
      id: COLLECTION_IDS.dailyTasks,
      name: 'work_journal_daily_tasks',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { maxSelect: 1, collectionId: users.id } },
        { name: 'date', type: 'date', required: true },
        { name: 'task', type: 'relation', required: true, options: { maxSelect: 1, collectionId: COLLECTION_IDS.tasks } },
        { name: 'position', type: 'number', required: true, options: { default: 0 } },
      ],
      indexes: [],
    },
  ]

  specs.forEach((spec) => {
    try {
      app.findCollectionByNameOrId(spec.id)
    } catch (_) {
      app.save(new Collection(spec))
    }
  })
}, (app) => {
  const names = [
    'work_journal_daily_tasks',
    'work_journal_notes',
    'work_journal_tasks',
    'work_journal_projects',
  ]

  names.forEach((name) => {
    try {
      const collection = app.findCollectionByNameOrId(name)
      app.delete(collection)
    } catch (_) {
      // already removed
    }
  })
})
