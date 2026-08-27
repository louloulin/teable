/**
 * Built-in seed eval cases — 12 hand-curated NL→schema cases covering the
 * most common field-type combos and one regression case for primary-key
 * selection.
 *
 * This is intentionally a small starter set; production CI fetches a
 * larger frozen set from `infra/eval/eval-cases.jsonl`.  Keeping the seed
 * here means the harness is usable without any external fixtures.
 *
 * License: AGPL-3.0
 */

import { EvalCase } from './eval-harness';

export const SEED_EVAL_CASES: EvalCase[] = [
  {
    id: 'contacts-basic',
    prompt: 'Make a contacts table with name, email, phone, and company.',
    gold: {
      fields: [
        { name: 'name', type: 'singleLine' },
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'phone' },
        { name: 'company', type: 'singleLine' },
      ],
      primary: 'name',
    },
    tags: ['basic'],
  },
  {
    id: 'orders-line-items',
    prompt: 'Customer orders with order number, customer name, total amount, status, created date.',
    gold: {
      fields: [
        { name: 'order_number', type: 'singleLine' },
        { name: 'customer_name', type: 'singleLine' },
        { name: 'total_amount', type: 'number' },
        {
          name: 'status',
          type: 'singleSelect',
          options: { choices: [{ name: 'pending' }, { name: 'paid' }, { name: 'shipped' }] },
        },
        { name: 'created_date', type: 'date' },
      ],
      primary: 'order_number',
    },
    tags: ['order', 'single_select'],
  },
  {
    id: 'inventory-checkbox',
    prompt:
      'A product inventory with SKU, name, description, in-stock checkbox, and reorder level.',
    gold: {
      fields: [
        { name: 'sku', type: 'singleLine' },
        { name: 'name', type: 'singleLine' },
        { name: 'description', type: 'longText' },
        { name: 'in_stock', type: 'checkbox' },
        { name: 'reorder_level', type: 'number' },
      ],
      primary: 'sku',
    },
    tags: ['inventory', 'checkbox'],
  },
  {
    id: 'events-date-range',
    prompt:
      'Conference events with title, start date/time, end date/time, location, and a short summary.',
    gold: {
      fields: [
        { name: 'title', type: 'singleLine' },
        { name: 'start_at', type: 'date' },
        { name: 'end_at', type: 'date' },
        { name: 'location', type: 'singleLine' },
        { name: 'summary', type: 'longText' },
      ],
      primary: 'title',
    },
    tags: ['event', 'dates'],
  },
  {
    id: 'bug-tracker-rating',
    prompt:
      'Bug tracker with id, title, severity (low/medium/high/critical), description, reporter, and a rating 1-5.',
    gold: {
      fields: [
        { name: 'id', type: 'autoNumber' },
        { name: 'title', type: 'singleLine' },
        {
          name: 'severity',
          type: 'singleSelect',
          options: {
            choices: [{ name: 'low' }, { name: 'medium' }, { name: 'high' }, { name: 'critical' }],
          },
        },
        { name: 'description', type: 'longText' },
        { name: 'reporter', type: 'singleLine' },
        { name: 'rating', type: 'number' },
      ],
      primary: 'id',
    },
    tags: ['bug', 'single_select'],
  },
  {
    id: 'books-long-text',
    prompt: 'Books with title, author, ISBN, summary, page count, and cover image URL.',
    gold: {
      fields: [
        { name: 'title', type: 'singleLine' },
        { name: 'author', type: 'singleLine' },
        { name: 'isbn', type: 'singleLine' },
        { name: 'summary', type: 'longText' },
        { name: 'page_count', type: 'number' },
        { name: 'cover_image_url', type: 'url' },
      ],
      primary: 'isbn',
    },
    tags: ['books', 'long_text'],
  },
  {
    id: 'payroll-currency',
    prompt: 'Employee payroll: name, role, base salary in USD, bonus, and start date.',
    gold: {
      fields: [
        { name: 'name', type: 'singleLine' },
        { name: 'role', type: 'singleLine' },
        { name: 'base_salary', type: 'number' },
        { name: 'bonus', type: 'number' },
        { name: 'start_date', type: 'date' },
      ],
      primary: 'name',
    },
    tags: ['payroll'],
  },
  {
    id: 'survey-multiselect',
    prompt:
      'Customer feedback survey: respondent email, satisfaction rating 1-10, areas to improve (multi-select: price, support, features, docs), and free-text comments.',
    gold: {
      fields: [
        { name: 'respondent_email', type: 'email' },
        { name: 'satisfaction', type: 'number' },
        {
          name: 'areas_to_improve',
          type: 'multipleSelects',
          options: {
            choices: [
              { name: 'price' },
              { name: 'support' },
              { name: 'features' },
              { name: 'docs' },
            ],
          },
        },
        { name: 'comments', type: 'longText' },
      ],
      primary: 'respondent_email',
    },
    tags: ['survey', 'multi_select'],
  },
  {
    id: 'crm-link',
    prompt:
      'CRM deals with company, contact, deal size, stage, owner, and a link to the contract document.',
    gold: {
      fields: [
        { name: 'company', type: 'singleLine' },
        { name: 'contact', type: 'singleLine' },
        { name: 'deal_size', type: 'number' },
        {
          name: 'stage',
          type: 'singleSelect',
          options: {
            choices: [{ name: 'lead' }, { name: 'qualified' }, { name: 'won' }, { name: 'lost' }],
          },
        },
        { name: 'owner', type: 'singleLine' },
        { name: 'contract_url', type: 'url' },
      ],
      primary: 'company',
    },
    tags: ['crm', 'link'],
  },
  {
    id: 'class-attendance',
    prompt:
      'Class attendance roster: student id, student name, class date, present (yes/no), and notes.',
    gold: {
      fields: [
        { name: 'student_id', type: 'singleLine' },
        { name: 'student_name', type: 'singleLine' },
        { name: 'class_date', type: 'date' },
        { name: 'present', type: 'checkbox' },
        { name: 'notes', type: 'longText' },
      ],
      primary: 'student_id',
    },
    tags: ['education', 'checkbox'],
  },
  {
    id: 'recipe-ingredients',
    prompt: 'Recipe book with title, servings, prep time in minutes, and ingredients (long text).',
    gold: {
      fields: [
        { name: 'title', type: 'singleLine' },
        { name: 'servings', type: 'number' },
        { name: 'prep_time_min', type: 'number' },
        { name: 'ingredients', type: 'longText' },
      ],
      primary: 'title',
    },
    tags: ['recipe'],
  },
  {
    id: 'task-tracker-tags',
    prompt:
      'Personal task tracker: task name, due date, priority (low/medium/high), tags (multi-select: work, home, urgent), and a notes field.',
    gold: {
      fields: [
        { name: 'task_name', type: 'singleLine' },
        { name: 'due_date', type: 'date' },
        {
          name: 'priority',
          type: 'singleSelect',
          options: { choices: [{ name: 'low' }, { name: 'medium' }, { name: 'high' }] },
        },
        {
          name: 'tags',
          type: 'multipleSelects',
          options: { choices: [{ name: 'work' }, { name: 'home' }, { name: 'urgent' }] },
        },
        { name: 'notes', type: 'longText' },
      ],
      primary: 'task_name',
    },
    tags: ['task', 'multi_select'],
  },
];
