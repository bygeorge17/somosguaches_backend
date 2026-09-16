const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config/env');
const Community = require('../models/Community');
const Evento = require('../models/Evento');
const Historia = require('../models/Historia');
const Leyenda = require('../models/Leyenda');
const NoticiaLocal = require('../models/NoticiaLocal');
const Personaje = require('../models/Personaje');
const Post = require('../models/Post');
const User = require('../models/User');

const dryRun = process.argv.includes('--dry-run');

function dateFromNow(days, hour = 12) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function credentials() {
  if (dryRun) {
    return {
      adminEmail: 'admin@somosguaches.local',
      adminPassword: 'DryRunAdmin123!',
      userEmail: 'usuario@somosguaches.local',
      userPassword: 'DryRunUser123!',
    };
  }

  const values = {
    adminEmail: process.env.SEED_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
    userEmail: process.env.SEED_USER_EMAIL,
    userPassword: process.env.SEED_USER_PASSWORD,
  };
  const names = {
    adminEmail: 'SEED_ADMIN_EMAIL',
    adminPassword: 'SEED_ADMIN_PASSWORD',
    userEmail: 'SEED_USER_EMAIL',
    userPassword: 'SEED_USER_PASSWORD',
  };
  const missing = Object.keys(values)
    .filter((key) => !values[key])
    .map((key) => names[key]);

  if (missing.length) {
    throw new Error(`Faltan variables para el seed: ${missing.join(', ')}`);
  }
  if (values.adminEmail.toLowerCase() === values.userEmail.toLowerCase()) {
    throw new Error('Los correos del admin y del usuario inicial deben ser distintos');
  }
  if (values.adminPassword.length < 8 || values.userPassword.length < 8) {
    throw new Error('Las contraseñas del seed deben tener al menos 8 caracteres');
  }
  return values;
}

function initialData(adminId, userId, communityId) {
  return {
    communities: [{
      name: 'Guardianes de la Memoria',
      location: 'Cauca',
      description: 'Comunidad dedicada a conservar relatos, costumbres y memoria oral.',
      coverImageUrl: 'https://picsum.photos/seed/memoria-guache/1200/600',
      tags: ['memoria', 'cultura', 'tradicion'],
      owner: adminId,
      members: [adminId, userId],
    }],
    personajes: [{
      name: 'La Guardiana del Rio',
      aliasOrRole: 'Protectora de las aguas',
      body: 'Personaje inspirado en quienes protegen los rios y transmiten sus historias.',
      imageUrl: 'https://picsum.photos/seed/guardiana-rio/1200/800',
      avatarUrl: 'https://picsum.photos/seed/guardiana-avatar/300/300',
      categories: ['territorio', 'memoria'],
      avgStars: 4.8,
      ratingsCount: 24,
      commentsCount: 8,
      isFeatured: true,
    }],
    historias: [{
      title: 'El camino que une las veredas',
      excerpt: 'Una jornada comunitaria recupero un sendero olvidado.',
      body: 'Familias de varias veredas se reunieron para limpiar el antiguo camino.',
      coverImageUrl: 'https://picsum.photos/seed/camino-veredas/1200/800',
      authorName: 'Colectivo Somos Guaches',
      location: 'Cauca',
      publishedAt: dateFromNow(-12),
      readMinutes: 4,
      tags: ['comunidad', 'territorio'],
      avgStars: 4.7,
      commentsCount: 6,
      isFeatured: true,
    }],
    leyendas: [{
      title: 'La luz sobre el río',
      synopsis: 'Una luz acompana a quienes regresan tarde a casa.',
      body: 'Los mayores cuentan que una luz serena aparece sobre el agua en noches sin luna.',
      coverImageUrl: 'https://picsum.photos/seed/luz-rio/1200/800',
      storyteller: 'Dona Carmen',
      sourceType: 'Tradicion oral',
      location: 'Ribera del río',
      era: 'Tiempo antiguo',
      tags: ['rio', 'misterio', 'oralidad'],
      avgStars: 4.9,
      commentsCount: 11,
      mysteryLevel: 4,
      isFeatured: true,
    }],
    eventos: [{
      kind: 'tradicion',
      title: 'Encuentro de música y memoria',
      start: dateFromNow(15, 17),
      end: dateFromNow(15, 21),
      location: 'Plaza comunitaria',
      organizer: 'Guardianes de la Memoria',
      description: 'Tarde de música, relatos y cocina tradicional.',
      coverImageUrl: 'https://picsum.photos/seed/encuentro-musica/1200/800',
      tags: ['musica', 'memoria', 'tradicion'],
      attendeesCount: 42,
      isFeatured: true,
    }],
    noticias: [{
      kind: 'aviso',
      title: 'Cierre temporal del puente comunitario',
      summary: 'El paso estará cerrado durante la jornada de mantenimiento.',
      body: 'Se recomienda utilizar la ruta alterna entre las 8:00 a. m. y las 2:00 p. m.',
      publishedAt: dateFromNow(-1),
      source: 'Junta comunitaria',
      location: 'Puente principal',
      coverImageUrl: 'https://picsum.photos/seed/cierre-puente/1200/800',
      severity: 'importante',
      tags: ['movilidad', 'mantenimiento'],
      isFeatured: true,
    }],
    posts: [{
      author: userId,
      type: 'text',
      text: 'Bienvenidos a Somos Guaches. Compartamos historias y saberes con respeto.',
      community: communityId,
      tags: ['bienvenida', 'comunidad'],
    }],
  };
}

async function ensureUser(data) {
  let user = await User.findOne({ email: data.email.toLowerCase() });
  const created = !user;
  if (!user) user = new User(data);
  user.role = data.role;
  user.isAdmin = data.role === 'admin';
  await user.save();
  return { user, created };
}

async function upsertDocuments(Model, documents, identity) {
  let created = 0;
  for (const document of documents) {
    const result = await Model.updateOne(
      { [identity]: document[identity] },
      { $setOnInsert: document },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    created += result.upsertedCount || 0;
  }
  return created;
}

async function validateData(values) {
  const adminId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const communityId = new mongoose.Types.ObjectId();
  const data = initialData(adminId, userId, communityId);
  const users = [
    new User({
      email: values.adminEmail,
      password: values.adminPassword,
      name: 'Administrador Somos Guaches',
      role: 'admin',
    }),
    new User({
      email: values.userEmail,
      password: values.userPassword,
      name: 'Guache de la Comunidad',
      role: 'user',
    }),
  ];
  const groups = [
    [Community, data.communities],
    [Personaje, data.personajes],
    [Historia, data.historias],
    [Leyenda, data.leyendas],
    [Evento, data.eventos],
    [NoticiaLocal, data.noticias],
    [Post, data.posts],
  ];

  await Promise.all(users.map((item) => item.validate()));
  for (const [Model, documents] of groups) {
    await Promise.all(documents.map((item) => new Model(item).validate()));
  }
  return data;
}

async function run() {
  const values = credentials();
  if (dryRun) {
    const data = await validateData(values);
    console.log(JSON.stringify({
      mode: 'dry-run',
      valid: true,
      totals: Object.fromEntries(
        Object.entries(data).map(([name, items]) => [name, items.length]),
      ),
    }, null, 2));
    return;
  }

  await mongoose.connect(MONGODB_URI);
  const admin = await ensureUser({
    email: values.adminEmail,
    password: values.adminPassword,
    name: 'Administrador Somos Guaches',
    bio: 'Cuenta administrativa inicial.',
    role: 'admin',
  });
  const normalUser = await ensureUser({
    email: values.userEmail,
    password: values.userPassword,
    name: 'Guache de la Comunidad',
    bio: 'Cuenta inicial para explorar la comunidad.',
    role: 'user',
  });

  await Promise.all([
    User.updateOne(
      { _id: normalUser.user._id },
      { $addToSet: { following: admin.user._id } },
    ),
    User.updateOne(
      { _id: admin.user._id },
      { $addToSet: { followers: normalUser.user._id } },
    ),
  ]);

  const draft = initialData(admin.user._id, normalUser.user._id, null);
  const communitiesCreated = await upsertDocuments(
    Community,
    draft.communities,
    'name',
  );
  const community = await Community.findOne({ name: draft.communities[0].name });
  const data = initialData(admin.user._id, normalUser.user._id, community._id);

  const created = {
    users: Number(admin.created) + Number(normalUser.created),
    communities: communitiesCreated,
    personajes: await upsertDocuments(Personaje, data.personajes, 'name'),
    historias: await upsertDocuments(Historia, data.historias, 'title'),
    leyendas: await upsertDocuments(Leyenda, data.leyendas, 'title'),
    eventos: await upsertDocuments(Evento, data.eventos, 'title'),
    noticias: await upsertDocuments(NoticiaLocal, data.noticias, 'title'),
    posts: await upsertDocuments(Post, data.posts, 'text'),
  };

  community.postsCount = await Post.countDocuments({ community: community._id });
  await community.save();
  console.log(JSON.stringify({ mode: 'seed', success: true, created }, null, 2));
}

run()
  .catch((error) => {
    console.error(`Seed fallido: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
