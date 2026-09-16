const { z } = require('zod');

const trimmedString = (max) => z.string().trim().max(max);
const requiredString = (max, message) => trimmedString(max).min(1, message);
const optionalString = (max) => trimmedString(max).optional();
const dateValue = z.union([z.string().trim().min(1), z.number(), z.date()])
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Fecha invalida',
  });
const nullableDateValue = z.union([dateValue, z.literal(''), z.null()]);
const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'ObjectId invalido');
const nullableObjectId = z.union([objectId, z.literal(''), z.null()]);
const urlOrPath = trimmedString(2048).refine(
  (value) => value === '' || /^https?:\/\//i.test(value) || value.startsWith('/'),
  { message: 'Debe ser una URL HTTP(S) o una ruta absoluta' },
);
const tags = z.array(requiredString(40, 'La etiqueta no puede estar vacia'))
  .max(8)
  .transform((values) => [...new Set(values)]);
const role = z.enum(['admin', 'user']);
const email = z.string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

function strictUpdate(shape) {
  return z.object(shape)
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Debes enviar al menos un campo',
    });
}

const register = z.object({
  email,
  password: z.string().min(8).max(72),
  name: requiredString(50, 'El nombre es obligatorio'),
}).strict();

const login = z.object({
  email,
  password: z.string().min(1).max(72),
}).strict();

const adminCreateUser = register.extend({
  bio: optionalString(160),
  avatar: urlOrPath.optional(),
  role: role.optional(),
}).strict();

const profileUpdate = strictUpdate({
  name: requiredString(50, 'El nombre es obligatorio').optional(),
  bio: optionalString(160),
  avatar: urlOrPath.optional(),
});

const roleUpdate = z.object({ role }).strict();

const communityShape = {
  name: requiredString(80, 'El nombre es obligatorio'),
  location: optionalString(120),
  description: requiredString(2000, 'La descripción es obligatoria'),
  coverImageUrl: urlOrPath.optional(),
  tags: tags.optional(),
};
const communityCreate = z.object(communityShape).strict();
const communityUpdate = strictUpdate({
  ...Object.fromEntries(
    Object.entries(communityShape).map(([key, schema]) => [key, schema.optional()]),
  ),
});

const personajeShape = {
  name: requiredString(100, 'El nombre es obligatorio'),
  aliasOrRole: optionalString(120),
  body: requiredString(3000, 'La descripción es obligatoria'),
  imageUrl: urlOrPath.optional(),
  avatarUrl: urlOrPath.optional(),
  categories: tags.optional(),
  avgStars: z.number().min(0).max(5).optional(),
  ratingsCount: z.number().int().min(0).optional(),
  commentsCount: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
};
const personajeCreate = z.object(personajeShape).strict();
const personajeUpdate = strictUpdate(
  Object.fromEntries(
    Object.entries(personajeShape).map(([key, schema]) => [key, schema.optional()]),
  ),
);

const historiaShape = {
  title: requiredString(140, 'El titulo es obligatorio'),
  excerpt: requiredString(1200, 'El extracto es obligatorio'),
  body: optionalString(12000),
  coverImageUrl: urlOrPath.optional(),
  authorName: requiredString(80, 'El autor es obligatorio'),
  location: optionalString(120),
  publishedAt: dateValue.optional(),
  readMinutes: z.number().int().min(1).optional(),
  tags: tags.optional(),
  avgStars: z.number().min(0).max(5).optional(),
  commentsCount: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
};
const historiaCreate = z.object(historiaShape).strict();
const historiaUpdate = strictUpdate(
  Object.fromEntries(
    Object.entries(historiaShape).map(([key, schema]) => [key, schema.optional()]),
  ),
);

const leyendaShape = {
  title: requiredString(140, 'El titulo es obligatorio'),
  synopsis: requiredString(1200, 'La sinopsis es obligatoria'),
  body: optionalString(12000),
  coverImageUrl: urlOrPath.optional(),
  storyteller: requiredString(80, 'El narrador es obligatorio'),
  sourceType: optionalString(60),
  location: optionalString(120),
  era: optionalString(80),
  tags: tags.optional(),
  avgStars: z.number().min(0).max(5).optional(),
  commentsCount: z.number().int().min(0).optional(),
  mysteryLevel: z.number().int().min(1).max(5).optional(),
  isFeatured: z.boolean().optional(),
};
const leyendaCreate = z.object(leyendaShape).strict();
const leyendaUpdate = strictUpdate(
  Object.fromEntries(
    Object.entries(leyendaShape).map(([key, schema]) => [key, schema.optional()]),
  ),
);

const eventoShape = {
  kind: z.enum(['evento', 'tradicion']).optional(),
  title: requiredString(140, 'El titulo es obligatorio'),
  start: dateValue,
  end: nullableDateValue.optional(),
  location: optionalString(120),
  organizer: optionalString(120),
  description: optionalString(3000),
  coverImageUrl: urlOrPath.optional(),
  tags: tags.optional(),
  attendeesCount: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
};
const eventoCreate = z.object(eventoShape).strict();
const eventoUpdate = strictUpdate(
  Object.fromEntries(
    Object.entries(eventoShape).map(([key, schema]) => [key, schema.optional()]),
  ),
);

const noticiaShape = {
  kind: z.enum(['noticia', 'aviso']).optional(),
  title: requiredString(160, 'El titulo es obligatorio'),
  summary: requiredString(1500, 'El resumen es obligatorio'),
  body: optionalString(15000),
  publishedAt: dateValue.optional(),
  source: optionalString(120),
  location: optionalString(120),
  coverImageUrl: urlOrPath.optional(),
  severity: z.enum(['normal', 'importante', 'urgente']).optional(),
  tags: tags.optional(),
  isFeatured: z.boolean().optional(),
};
const noticiaCreate = z.object(noticiaShape).strict();
const noticiaUpdate = strictUpdate(
  Object.fromEntries(
    Object.entries(noticiaShape).map(([key, schema]) => [key, schema.optional()]),
  ),
);

const postShape = {
  type: z.enum(['text', 'image', 'video']).optional(),
  text: trimmedString(3000).optional(),
  mediaUrl: trimmedString(2048).optional(),
  communityId: nullableObjectId.optional(),
  community: nullableObjectId.optional(),
  tags: tags.optional(),
};
const onlyOneCommunityField = (value) => !(
  value.communityId !== undefined && value.community !== undefined
);
const postCreate = z.object(postShape).strict().refine(onlyOneCommunityField, {
  path: ['communityId'],
  message: 'Envia communityId o community, no ambos',
});
const postUpdate = strictUpdate(
  Object.fromEntries(
    Object.entries(postShape).map(([key, schema]) => [key, schema.optional()]),
  ),
).refine(onlyOneCommunityField, {
  path: ['communityId'],
  message: 'Envia communityId o community, no ambos',
});

const comment = z.object({
  text: requiredString(1000, 'El comentario es obligatorio'),
}).strict();
const reaction = z.object({ reaction: z.enum(['like', 'dislike']) }).strict();
const rating = z.object({ stars: z.number().int().min(1).max(5) }).strict();

module.exports = {
  adminCreateUser,
  comment,
  communityCreate,
  communityUpdate,
  eventoCreate,
  eventoUpdate,
  historiaCreate,
  historiaUpdate,
  leyendaCreate,
  leyendaUpdate,
  login,
  noticiaCreate,
  noticiaUpdate,
  personajeCreate,
  personajeUpdate,
  postCreate,
  postUpdate,
  profileUpdate,
  rating,
  reaction,
  register,
  roleUpdate,
};
