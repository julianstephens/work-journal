migrate((app) => {
  const notes = app.findCollectionByNameOrId('work_journal_notes')
  const project = notes.fields.getByName('project')
  project.required = false
  app.save(notes)
}, (app) => {
  const notes = app.findCollectionByNameOrId('work_journal_notes')
  const project = notes.fields.getByName('project')
  project.required = true
  app.save(notes)
})
