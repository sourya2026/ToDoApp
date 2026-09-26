// =============================================================================
// DATA LAYER  -  Mongoose schemas
//
// Every schema exposes `id` (string) instead of `_id`/`__v` so the API shape
// matches what the UI and the shared can() function expect.
// =============================================================================
import mongoose from 'mongoose';
import { ROLES, SECONDARY_KIND, LIST_KIND } from '@todo/shared';

const { Schema, model, Types } = mongoose;

const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.pinHash;
    return ret;
  },
};

// ---------------------------------------------------------------- User -----
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  pinHash: { type: String, required: true },
  role: { type: String, enum: Object.values(ROLES), default: ROLES.EMPLOYEE, index: true },
  // Users are deactivated, never deleted, so authorship and history stay intact.
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions });

// ------------------------------------------------------------- Project -----
const projectSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  client: { type: String, default: '', trim: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
  assignedUserIds: [{ type: Types.ObjectId, ref: 'User', index: true }],
  createdBy: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions });

// ---------------------------------------------------------------- Item -----
const itemSchema = new Schema({
  projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
  // Its own column, required, and unique per project (see the compound index below).
  ticketNumber: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  priority: { type: String, required: true },
  status: { type: String, required: true, index: true },
  ownerId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  secondaryKind: { type: String, enum: Object.values(SECONDARY_KIND), default: SECONDARY_KIND.TEAM },
  secondaryUserId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
  dueDate: { type: Date, default: null },

  createdBy: { type: Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Types.ObjectId, ref: 'User', required: true },

  // Denormalised so the grid renders "Latest Comment" without an N+1 lookup.
  // Kept in step by addComment() in lib/comments.js - the only writer.
  commentCount: { type: Number, default: 0 },
  latestComment: {
    text: { type: String, default: '' },
    authorId: { type: Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: null },
  },
}, { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions });

itemSchema.index({ projectId: 1, ticketNumber: 1 }, { unique: true });
itemSchema.index({ title: 'text', ticketNumber: 'text' });

// ------------------------------------------------------------- Comment -----
const commentSchema = new Schema({
  itemId: { type: Types.ObjectId, ref: 'Item', required: true, index: true },
  text: { type: String, required: true },
  authorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  editedAt: { type: Date, default: null },
  // Editing a comment pushes the previous text here - the original is never lost.
  versions: [{
    text: String,
    replacedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions });

// ------------------------------------------------------------ AuditLog -----
const auditSchema = new Schema({
  itemId: { type: Types.ObjectId, ref: 'Item', index: true },
  projectId: { type: Types.ObjectId, ref: 'Project', index: true },
  entity: { type: String, default: 'item' },
  field: { type: String, required: true },
  fieldLabel: { type: String, default: '' },
  oldValue: { type: String, default: '' },
  newValue: { type: String, default: '' },
  changedBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  at: { type: Date, default: Date.now, index: true },
}, { versionKey: false, toJSON: jsonOptions, toObject: jsonOptions });

// ------------------------------------------------------- ListValue (config) -
// Admin-editable dropdown values. The UI never hard-codes a status or priority.
const listValueSchema = new Schema({
  kind: { type: String, enum: Object.values(LIST_KIND), required: true, index: true },
  label: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  color: { type: String, default: '#64748b' },
  active: { type: Boolean, default: true },
}, { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions });

listValueSchema.index({ kind: 1, label: 1 }, { unique: true });

export const User = model('User', userSchema);
export const Project = model('Project', projectSchema);
export const Item = model('Item', itemSchema);
export const Comment = model('Comment', commentSchema);
export const AuditLog = model('AuditLog', auditSchema);
export const ListValue = model('ListValue', listValueSchema);
