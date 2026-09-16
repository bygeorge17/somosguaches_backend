const mongoose = require('mongoose');

function mongooseValidationDetails(error) {
  return Object.values(error.errors).map((item) => ({
    field: item.path,
    message: item.message,
    code: item.kind || 'validation_error',
  }));
}

function normalizeError(error, isProduction) {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return {
      status: 400,
      code: 'INVALID_JSON',
      message: 'El cuerpo de la solicitud no contiene JSON válido',
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son validos',
      details: mongooseValidationDetails(error),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      code: 'INVALID_ID',
      message: `El valor de ${error.path} no es válido`,
      details: [{
        field: error.path,
        message: error.message,
        code: 'cast_error',
      }],
    };
  }

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern || error.keyValue || {});
    return {
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'Ya existe un recurso con esos datos',
      details: fields.map((field) => ({
        field,
        message: `${field} ya esta registrado`,
        code: 'duplicate',
      })),
    };
  }

  if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error?.name)) {
    return {
      status: 401,
      code: 'INVALID_TOKEN',
      message: 'Token invalido o expirado',
    };
  }

  if (error?.name === 'MulterError') {
    return {
      status: 400,
      code: 'UPLOAD_ERROR',
      message: error.message,
    };
  }

  const candidateStatus = Number(error?.status || error?.statusCode);
  const status = candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 500;
  const message = status >= 500 && isProduction
    ? 'Error interno del servidor'
    : error?.message || 'Error interno del servidor';

  return {
    status,
    code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
    message,
    details: Array.isArray(error?.details) ? error.details : undefined,
  };
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Ruta no encontrada',
    code: 'NOT_FOUND',
    method: req.method,
    path: req.originalUrl,
  });
}

function globalErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const isProduction = req.app.get('env') === 'production';
  const normalized = normalizeError(error, isProduction);
  const response = {
    error: normalized.message,
    code: normalized.code,
    method: req.method,
    path: req.originalUrl,
  };

  if (normalized.details?.length) response.details = normalized.details;
  if (!isProduction && error?.stack) response.stack = error.stack;

  res.status(normalized.status).json(response);
}

module.exports = {
  globalErrorHandler,
  normalizeError,
  notFoundHandler,
};
