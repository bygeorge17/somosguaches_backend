function validationDetails(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
    code: issue.code,
  }));
}

function validateBody(schema) {
  return function bodyValidationMiddleware(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Request body invalido',
        details: validationDetails(result.error),
      });
    }

    req.body = result.data;
    next();
  };
}

module.exports = { validateBody, validationDetails };
