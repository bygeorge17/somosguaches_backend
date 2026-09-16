function resourceId(resource) {
  return resource?._id?.toString() || resource?.toString() || '';
}

function userRole(user) {
  if (user?.role) return user.role;
  return user?.isAdmin === true ? 'admin' : 'user';
}

function serializeUser(user, options = {}) {
  const {
    includePrivate = false,
    currentUserId = null,
  } = options;
  const followers = user.followers || [];
  const role = userRole(user);

  const serialized = {
    id: resourceId(user),
    name: user.name,
    bio: user.bio || '',
    avatar: user.avatar || '',
    role,
    isAdmin: role === 'admin',
    followersCount: followers.length,
    followingCount: (user.following || []).length,
    isFollowing: currentUserId
      ? followers.some((follower) => resourceId(follower) === currentUserId)
      : false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  if (includePrivate) {
    serialized.email = user.email;
    serialized.isActive = user.isActive !== false;
  }

  return serialized;
}

module.exports = { resourceId, serializeUser, userRole };
