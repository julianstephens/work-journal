migrate((app) => {
  const findCollection = (nameOrId) => {
    try {
      return app.findCollectionByNameOrId(nameOrId)
    } catch (_) {
      return null
    }
  }

  const authCollection = findCollection('_pb_users_auth_')
  if (!authCollection) {
    throw new Error('Auth collection _pb_users_auth_ not found; PocketBase did not initialize correctly.')
  }

  const relationField = (name, collectionId, required = false) => new RelationField({
    name,
    required,
    maxSelect: 1,
    collectionId,
  })

  const ensureField = (collection, name, fieldFactory) => {
    const hasField = collection.fields?.all?.some((field) => field.name === name)
    if (!hasField) {
      collection.fields.add(fieldFactory())
    }
  }

  const applyUserScopedRules = (collection) => {
    const rule = '@request.auth.id != "" && user = @request.auth.id'
    collection.listRule = rule
    collection.viewRule = rule
    collection.createRule = rule
    collection.updateRule = rule
    collection.deleteRule = rule
  }

  const buildProjectCollection = () => {
    const collection = new Collection({
      id: 'wjprojects00001',
      name: 'work_journal_projects',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })

    collection.fields.add(
      new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }),
      new TextField({ name: 'name', required: true }),
      new TextField({ name: 'description' }),
      new BoolField({ name: 'archived', required: false, default: false }),
      new NumberField({ name: 'position', required: false, default: 0 }),
    )

    return collection
  }

  const buildTaskCollection = (projectsCollection) => {
    const collection = new Collection({
      id: 'wjtasks00000001',
      name: 'work_journal_tasks',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })

    collection.fields.add(
      new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }),
      relationField('project', projectsCollection.id),
      new TextField({ name: 'title', required: true }),
      new BoolField({ name: 'completed', required: false, default: false }),
      new NumberField({ name: 'position', required: false, default: 0 }),
      new DateField({ name: 'completed_at' }),
    )

    return collection
  }

  const buildNoteCollection = (projectsCollection) => {
    const collection = new Collection({
      id: 'wjnotes00000001',
      name: 'work_journal_notes',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })

    collection.fields.add(
      new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }),
      relationField('project', projectsCollection.id, true),
      new TextField({ name: 'title', required: true }),
      new TextField({ name: 'body', required: true }),
    )

    return collection
  }

  const buildDailyTaskCollection = (tasksCollection) => {
    const collection = new Collection({
      id: 'wjdailytasks001',
      name: 'work_journal_daily_tasks',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })

    collection.fields.add(
      new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }),
      new DateField({ name: 'date', required: true }),
      relationField('task', tasksCollection.id, true),
      new NumberField({ name: 'position', required: false, default: 0 }),
    )

    return collection
  }

  const projectsCollection = findCollection('work_journal_projects') ?? buildProjectCollection()
  app.save(projectsCollection)

  const tasksCollection = findCollection('work_journal_tasks') ?? buildTaskCollection(projectsCollection)
  app.save(tasksCollection)

  const savedTasksCollection = app.findCollectionByNameOrId('work_journal_tasks')
  if (!savedTasksCollection.fields?.all?.some((field) => field.name === 'parent')) {
    savedTasksCollection.fields.add(new RelationField({
      name: 'parent',
      required: false,
      collectionId: savedTasksCollection.id,
      cascadeDelete: false,
      maxSelect: 1,
    }))
    app.save(savedTasksCollection)
  }

  const notesCollection = findCollection('work_journal_notes') ?? buildNoteCollection(projectsCollection)
  app.save(notesCollection)

  const dailyTasksCollection = findCollection('work_journal_daily_tasks') ?? buildDailyTaskCollection(tasksCollection)
  app.save(dailyTasksCollection)

  ensureField(projectsCollection, 'user', () => new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }))
  ensureField(projectsCollection, 'name', () => new TextField({ name: 'name', required: true }))
  ensureField(projectsCollection, 'description', () => new TextField({ name: 'description' }))
  ensureField(projectsCollection, 'archived', () => new BoolField({ name: 'archived', required: false, default: false }))
  ensureField(projectsCollection, 'position', () => new NumberField({ name: 'position', required: false, default: 0 }))
  applyUserScopedRules(projectsCollection)
  app.save(projectsCollection)

  ensureField(tasksCollection, 'user', () => new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }))
  ensureField(tasksCollection, 'project', () => relationField('project', projectsCollection.id))
  ensureField(tasksCollection, 'title', () => new TextField({ name: 'title', required: true }))
  ensureField(tasksCollection, 'completed', () => new BoolField({ name: 'completed', required: false, default: false }))
  ensureField(tasksCollection, 'position', () => new NumberField({ name: 'position', required: false, default: 0 }))
  ensureField(tasksCollection, 'completed_at', () => new DateField({ name: 'completed_at' }))
  applyUserScopedRules(tasksCollection)
  app.save(tasksCollection)

  ensureField(notesCollection, 'user', () => new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }))
  ensureField(notesCollection, 'project', () => relationField('project', projectsCollection.id, true))
  ensureField(notesCollection, 'title', () => new TextField({ name: 'title', required: true }))
  ensureField(notesCollection, 'body', () => new TextField({ name: 'body', required: true }))
  applyUserScopedRules(notesCollection)
  app.save(notesCollection)

  ensureField(dailyTasksCollection, 'user', () => new RelationField({ name: 'user', required: true, maxSelect: 1, collectionId: authCollection.id }))
  ensureField(dailyTasksCollection, 'date', () => new DateField({ name: 'date', required: true }))
  ensureField(dailyTasksCollection, 'task', () => relationField('task', tasksCollection.id, true))
  ensureField(dailyTasksCollection, 'position', () => new NumberField({ name: 'position', required: false, default: 0 }))
  applyUserScopedRules(dailyTasksCollection)
  app.save(dailyTasksCollection)
}, (app) => {
  const collectionNames = [
    'work_journal_projects',
    'work_journal_tasks',
    'work_journal_notes',
    'work_journal_daily_tasks',
  ]

  collectionNames.forEach((name) => {
    try {
      const collection = app.findCollectionByNameOrId(name)
      app.delete(collection)
    } catch (_) {
      // already removed
    }
  })
})
