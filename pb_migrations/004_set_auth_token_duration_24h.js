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

  // 24h access token lifetime (in seconds).
  unmarshal({ authToken: { duration: 86400 } }, authCollection)
  app.save(authCollection)
}, (_app) => {
  // Rollback intentionally left as no-op because previous token duration may vary by environment.
})
