// models/User.js
const mongoose = require('mongoose');
const bcrypt=require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+\@.+\..+/, 'Por favor ingresa un email válido']
  },
  password: {
    type: String,
    required: true,
    minlength: 8, // buena práctica para seguridad
  },
  name: {
    type: String,
    required:true,
    maxlength: 50,
    trim: true,
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 160,
    default: '',
  },
  avatar: {
    type: String, // URL de la imagen de perfil
    trim: true,
    maxlength: 2048,
    default: '',
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: function defaultRole() {
      return this.isAdmin === true ? 'admin' : 'user';
    },
  },
  accountType: {
    type: String,
    enum: ['personal', 'official', 'automated'],
    default: 'personal',
  }
}, {
  timestamps: true // agrega createdAt y updatedAt automáticamente
});

userSchema.pre('validate', function syncRole(next) {
  if (this.isModified('role')) {
    this.isAdmin = this.role === 'admin';
  } else if (this.isModified('isAdmin')) {
    this.role = this.isAdmin ? 'admin' : 'user';
  }
  next();
});

// Hashear la contraseña antes de guardar
userSchema.pre('save', async function(next) {  
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
