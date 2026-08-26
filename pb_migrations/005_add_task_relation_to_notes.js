migrate((app) => {
  const notes = app.findCollectionByNameOrId('work_journal_notes')
  const tasks = app.findCollectionByNameOrId('work_journal_tasks')

  if (!notes || !tasks) return

  const hasTaskField = notes.fields?.all?.some((field) => field.name === 'task')

  if (!hasTaskField) {
    notes.fields.add(new RelationField({
      name: 'task',
      required: false,
      maxSelect: 1,
      collectionId: tasks.id,
      cascadeDelete: false,
    }))
    app.save(notes)
  }
}, (app) => {
  const notes = app.findCollectionByNameOrId('work_journal_notes')
  if (!notes) return

  const taskField = notes.fields.getByName('task')
  if (taskField) {
    notes.fields.remove(taskField)
    app.save(notes)
  }
})
