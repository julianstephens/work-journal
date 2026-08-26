migrate((app) => {
  const authCollection = app.findCollectionByNameOrId('_pb_users_auth_')

  const userField = () => new RelationField({
    name: 'user',
    required: true,
    maxSelect: 1,
    collectionId: authCollection.id,
  })

  const relationField = (name, collectionId, required = false) => new RelationField({
    name,
    required,
    maxSelect: 1,
    collectionId,
  })

  const applyRules = (collection, rule) => {
    collection.listRule = rule
    collection.viewRule = rule
    collection.createRule = rule
    collection.updateRule = rule
    collection.deleteRule = rule
  }

  const userScopedRule = '@request.auth.id != "" && user = @request.auth.id'

  const projects = app.findCollectionByNameOrId('work_journal_projects')
  projects.fields.add(
    userField(),
    new TextField({ name: 'name', required: true }),
    new TextField({ name: 'description' }),
    new BoolField({ name: 'archived', required: true, default: false }),
    new NumberField({ name: 'position', required: true, default: 0 }),
  )
  applyRules(projects, userScopedRule)
  app.save(projects)

  const tasks = app.findCollectionByNameOrId('work_journal_tasks')
  tasks.fields.add(
    userField(),
    relationField('project', projects.id),
    relationField('parent', tasks.id),
    new TextField({ name: 'title', required: true }),
    new BoolField({ name: 'completed', required: true, default: false }),
    new NumberField({ name: 'position', required: true, default: 0 }),
    new DateField({ name: 'completed_at' }),
  )
  applyRules(tasks, userScopedRule)
  app.save(tasks)

  const notes = app.findCollectionByNameOrId('work_journal_notes')
  notes.fields.add(
    userField(),
    relationField('project', projects.id, true),
    new TextField({ name: 'title', required: true }),
    new TextField({ name: 'body', required: true }),
  )
  applyRules(notes, userScopedRule)
  app.save(notes)

  const dailyTasks = app.findCollectionByNameOrId('work_journal_daily_tasks')
  dailyTasks.fields.add(
    userField(),
    new DateField({ name: 'date', required: true }),
    relationField('task', tasks.id, true),
    new NumberField({ name: 'position', required: true, default: 0 }),
  )
  dailyTasks.indexes = []
  applyRules(dailyTasks, userScopedRule)
  app.save(dailyTasks)
}, (app) => {
  const collectionNames = [
    'work_journal_projects',
    'work_journal_tasks',
    'work_journal_notes',
    'work_journal_daily_tasks',
  ]

  const authOnlyRule = '@request.auth.id != ""'

  collectionNames.forEach((name) => {
    const collection = app.findCollectionByNameOrId(name)
    collection.indexes = []
    collection.fields.removeByName('user')
    collection.fields.removeByName('name')
    collection.fields.removeByName('description')
    collection.fields.removeByName('archived')
    collection.fields.removeByName('position')
    collection.fields.removeByName('project')
    collection.fields.removeByName('parent')
    collection.fields.removeByName('title')
    collection.fields.removeByName('completed')
    collection.fields.removeByName('completed_at')
    collection.fields.removeByName('body')
    collection.fields.removeByName('date')
    collection.fields.removeByName('task')
    collection.listRule = authOnlyRule
    collection.viewRule = authOnlyRule
    collection.createRule = authOnlyRule
    collection.updateRule = authOnlyRule
    collection.deleteRule = authOnlyRule
    app.save(collection)
  })
})