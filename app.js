var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const mongoose=require('mongoose');
const { MONGODB_URI } = require('./config/env');
const {
  globalErrorHandler,
  notFoundHandler,
} = require('./middleware/errorHandler');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');
var postsRouter = require('./routes/posts');
var communitiesRouter = require('./routes/communities');
var personajesRouter = require('./routes/personajes');
var historiasRouter = require('./routes/historias');
var leyendasRouter = require('./routes/leyendas');
var eventosRouter = require('./routes/eventos');
var noticiasLocalesRouter = require('./routes/noticiasLocales');
var mediaRouter = require('./routes/media');

mongoose.connect(MONGODB_URI)

var app = express();

const cors = require('cors');
app.use(cors({
  exposedHeaders: ['X-Has-More', 'X-Next-Page'],
}));


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/posts', postsRouter);
app.use('/communities', communitiesRouter);
app.use('/personajes', personajesRouter);
app.use('/historias', historiasRouter);
app.use('/leyendas', leyendasRouter);
app.use('/eventos', eventosRouter);
app.use('/noticias/locales', noticiasLocalesRouter);
app.use('/media', mediaRouter);
app.use('/admin', require('./routes/admin'));

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
