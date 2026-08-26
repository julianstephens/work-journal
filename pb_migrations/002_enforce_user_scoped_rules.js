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

  const collectionNames = [
    'work_journal_projects',
    'work_journal_tasks',
    'work_journal_notes',
    'work_journal_daily_tasks',
  ]

  collectionNames.forEach((name) => {
    const collection = findCollection(name)
    if (!collection) return

    ensureField(collection, 'user', () => new RelationField({
      name: 'user',
      required: true,
      maxSelect: 1,
      collectionId: authCollection.id,
    }))

    if (name === 'work_journal_projects') {
      ensureField(collection, 'name', () => new TextField({ name: 'name', required: true }))
      ensureField(collection, 'description', () => new TextField({ name: 'description' }))
      ensureField(collection, 'archived', () => new BoolField({ name: 'archived', required: false, default: false }))
      ensureField(collection, 'position', () => new NumberField({ name: 'position', required: false, default: 0 }))
    }

    if (name === 'work_journal_tasks') {
      const projectCollection = findCollection('work_journal_projects')
      if (projectCollection) {
        ensureField(collection, 'project', () => relationField('project', projectCollection.id))
      }
      if (!collection.fields?.all?.some((field) => field.name === 'parent')) {
        collection.fields.add(new RelationField({
          name: 'parent',
          required: false,
          collectionId: collection.id,
          cascadeDelete: false,
          maxSelect: 1,
        }))
      }
      ensureField(collection, 'title', () => new TextField({ name: 'title', required: true }))
      ensureField(collection, 'completed', () => new BoolField({ name: 'completed', required: false, default: false }))
      ensureField(collection, 'position', () => new NumberField({ name: 'position', required: false, default: 0 }))
      ensureField(collection, 'completed_at', () => new DateField({ name: 'completed_at' }))
    }

    if (name === 'work_journal_notes') {
      const projectCollection = findCollection('work_journal_projects')
      if (projectCollection) {
        ensureField(collection, 'project', () => relationField('project', projectCollection.id, true))
      }
      ensureField(collection, 'title', () => new TextField({ name: 'title', required: true }))
      ensureField(collection, 'body', () => new TextField({ name: 'body', required: true }))
    }

    if (name === 'work_journal_daily_tasks') {
      ensureField(collection, 'date', () => new DateField({ name: 'date', required: true }))
      const taskCollection = findCollection('work_journal_tasks')
      if (taskCollection) {
        ensureField(collection, 'task', () => relationField('task', taskCollection.id, true))
      }
      ensureField(collection, 'position', () => new NumberField({ name: 'position', required: false, default: 0 }))
    }

    applyUserScopedRules(collection)
    app.save(collection)
  })
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
      collection.indexes = []
      app.save(collection)
    } catch (_) {
      // already removed
    }
  })
})