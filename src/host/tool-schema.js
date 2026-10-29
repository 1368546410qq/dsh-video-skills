/**
 * Tool definitions for the video-skill tools, written against the dsh-tools
 * schema DSL. The host package is imported lazily and mirrored locally, so a
 * resolution miss degrades to the same definition shape instead of no tools.
 * @module dsh-video-skills/tool-schema
 */

/** Compile one author-facing value schema to the supported JSON Schema subset. */
export function compileValueSchema(spec, at = 'schema') {
  if (spec === null || typeof spec !== 'object') throw new TypeError(at + ' must be a schema object');
  const node = {};
  if (typeof spec.description === 'string') node.description = spec.description;
  if (typeof spec.title === 'string') node.title = spec.title;
  if (spec.default !== undefined) node.default = spec.default;
  if (spec.examples !== undefined) node.examples = spec.examples;
  if (Array.isArray(spec.enum)) node.enum = spec.enum.slice();
  if (spec.const !== undefined) node.const = spec.const;
  if (Array.isArray(spec.oneOf)) {
    node.oneOf = spec.oneOf.map((branch, index) => compileValueSchema(branch, at + '.oneOf[' + index + ']'));
    return node;
  }
  switch (spec.type) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'null':
      node.type = spec.type;
      return node;
    case 'json':
      return node;
    case 'array':
      node.type = 'array';
      if (spec.items !== undefined) node.items = compileValueSchema(spec.items, at + '.items');
      return node;
    case 'object': {
      node.type = 'object';
      const compiled = compileProperties(spec.properties ?? {}, at + '.properties');
      if (Object.keys(compiled.properties).length > 0) node.properties = compiled.properties;
      if (compiled.required.length > 0) node.required = compiled.required;
      node.additionalProperties = spec.additionalProperties === true;
      return node;
    }
    default:
      throw new TypeError(at + '.type must be string/number/integer/boolean/null/array/object/json, or oneOf');
  }
}

/** Compile one property map, lifting per-property requiredness into a required array. */
function compileProperties(spec, at) {
  const properties = {};
  const required = [];
  for (const [key, value] of Object.entries(spec)) {
    properties[key] = compileValueSchema(value, at + '.' + key);
    if (value?.required === true) required.push(key);
  }
  return { properties, required };
}

/** Compile an implicit open parameter root, exactly as dsh-tools does. */
export function compileParameters(spec, at = 'parameters') {
  const compiled = compileProperties(spec ?? {}, at);
  const schema = { type: 'object', properties: compiled.properties };
  if (compiled.required.length > 0) schema.required = compiled.required;
  return schema;
}

/** Local mirror of dsh-tools defineTool, used when the host package is not resolvable. */
export function localDefineTool(options) {
  if (typeof options?.output?.render !== 'function') {
    throw new TypeError('tool "' + options?.name + '" must declare output { schema, render }');
  }
  const definition = {
    name: options.name,
    description: options.description,
    parameters: compileParameters(options.parameters),
    output: {
      schema: compileValueSchema(options.output.schema, 'output.schema'),
      render: (args, value) => options.output.render(args, value),
    },
    execute: async (args, execution) => options.execute(args, execution),
  };
  if (options.timeoutMs !== undefined) definition.timeoutMs = options.timeoutMs;
  return definition;
}

/** Resolve the host defineTool, falling back to the local mirror. */
export async function resolveDefineTool(load = () => import('@deepseek-ai/dsh-tools')) {
  try {
    const loaded = await load();
    if (typeof loaded?.defineTool === 'function') return loaded.defineTool;
  } catch {
    /* the local mirror below keeps the tools registrable */
  }
  return localDefineTool;
}

const nullableString = () => ({ oneOf: [{ type: 'string' }, { type: 'null' }] });
const nullableNumber = () => ({ oneOf: [{ type: 'number' }, { type: 'null' }] });

/** Public catalog entry shape, shared by both tools' output schemas. */
export const ENTRY_SCHEMA = {
  type: 'object',
  description: 'One catalog entry.',
  additionalProperties: true,
  properties: {
    repo: { type: 'string', description: 'GitHub repository as owner/name.' },
    path: nullableString(),
    stars: { type: 'number' },
    description: { type: 'string' },
    kind: { type: 'string' },
    grade: { type: 'string', enum: ['safe', 'caution'] },
    language: nullableString(),
    license: nullableString(),
    previewUrl: nullableString(),
    sizeBytes: nullableNumber(),
  },
};

/** Output schema of video_skill_search. */
export const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    count: { type: 'integer', description: 'Matching entries before the page limit.' },
    items: { type: 'array', items: ENTRY_SCHEMA },
  },
};

/** Output schema of video_skill_install; failures carry an error code instead. */
export const INSTALL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    message: { type: 'string' },
    dir: { type: 'string' },
    name: { type: 'string' },
    installed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          target: { type: 'string' },
          dir: { type: 'string' },
          files: { type: 'integer' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

/** Output schema of video_skill_uninstall; failures carry an error code instead. */
export const UNINSTALL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    removed: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        target: { type: 'string' },
        dir: { type: 'string' },
      },
    },
  },
};

/** Parameters of video_skill_search. */
export const SEARCH_PARAMETERS = {
  query: { type: 'string', description: 'Free-text match over repository name and description.' },
  kind: {
    type: 'string',
    description: 'Exact catalog kind: general, promo, explainer, editing, shorts, avatar, story, motion, craft or music.',
  },
  grade: { type: 'string', enum: ['safe', 'caution'], description: 'Security grade recorded by the catalog.' },
  license: { type: 'string', description: 'Exact license id, matched case-insensitively.' },
  minStars: { type: 'integer', description: 'Only entries with at least this many stars.' },
  limit: { type: 'integer', description: 'Page size; default 20, maximum 100.' },
};

/** Parameters of video_skill_install. */
export const INSTALL_PARAMETERS = {
  repo: { type: 'string', required: true, description: 'GitHub repository as owner/name.' },
  path: { type: 'string', description: 'Skill directory inside the repository; omit to detect the shallowest SKILL.md.' },
  name: { type: 'string', description: 'Override the installed skill directory name.' },
  targets: {
    type: 'array',
    items: { type: 'string', enum: ['claude', 'dsh'] },
    default: ['dsh'],
    description: 'Skill roots to install into: claude for ~/.claude/skills, dsh for ~/.dsh/skills. Default dsh.',
  },
};

/** Parameters of video_skill_uninstall. */
export const UNINSTALL_PARAMETERS = {
  name: {
    type: 'string',
    required: true,
    description: 'Installed skill directory name, as video_skill_install reported it.',
  },
  target: {
    type: 'string',
    required: true,
    enum: ['claude', 'dsh'],
    description: 'Skill root to remove from: claude for ~/.claude/skills, dsh for ~/.dsh/skills.',
  },
};

/** One text content block, the shape output.render must return. */
function textBlock(text) {
  return [{ type: 'text', text }];
}

/** Render search results compactly for the model. */
function renderSearch(_args, value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  const lines = [String(value?.count ?? 0) + ' matching skill(s), showing ' + items.length];
  for (const item of items) {
    const where = item.path === null || item.path === undefined ? '' : ' [' + item.path + ']';
    const description = String(item.description ?? '').slice(0, 140);
    lines.push('- ' + item.repo + where + ' (' + item.stars + ' stars, ' + item.kind + ', ' + item.grade + ') ' + description);
  }
  return textBlock(lines.join('\n'));
}

/** Render one uninstall outcome for the model. */
function renderUninstall(_args, value) {
  if (value?.ok === true) {
    return textBlock('removed ' + value.removed.name + ' (' + value.removed.target + ') from ' + value.removed.dir);
  }
  return textBlock('uninstall failed: ' + String(value?.error ?? 'unknown'));
}

/**
 * Build the three tool definitions.
 * @param options.defineTool - defineTool from the host package or the local mirror.
 * @param options.loadCatalog - async catalog loader.
 * @param options.filterEntries - pure entry filter.
 * @param options.installSkill - async install engine.
 * @param options.uninstallSkill - async uninstall engine.
 */
export function buildVideoTools(options) {
  const { defineTool = localDefineTool, loadCatalog, filterEntries, installSkill, uninstallSkill } = options;
  return [
    defineTool({
      name: 'video_skill_search',
      description:
        'Search the awesome-claude-video-skills catalog (373 GitHub skill repositories for agentic video production). ' +
        'Filters: free-text query, kind, security grade, license, minimum stars. Results are ranked by stars.',
      parameters: SEARCH_PARAMETERS,
      output: { schema: SEARCH_OUTPUT_SCHEMA, render: renderSearch },
      execute: async (args) => {
        const catalog = await loadCatalog();
        return filterEntries(catalog.entries, args ?? {});
      },
    }),
    defineTool({
      name: 'video_skill_install',
      description:
        'Install one catalog skill into ~/.claude/skills or ~/.dsh/skills by downloading its GitHub archive and copying ' +
        'the SKILL.md directory. No code from the repository is executed; an existing directory this plugin did not ' +
        'create is never overwritten.',
      parameters: INSTALL_PARAMETERS,
      output: {
        schema: INSTALL_OUTPUT_SCHEMA,
        render: (_args, value) => textBlock(JSON.stringify(value, null, 2)),
      },
      execute: async (args) => installSkill(args ?? {}),
    }),
    defineTool({
      name: 'video_skill_uninstall',
      description:
        'Remove one skill this plugin installed from ~/.claude/skills or ~/.dsh/skills. A directory without the ' +
        'plugin marker was installed by hand and is never removed.',
      parameters: UNINSTALL_PARAMETERS,
      output: { schema: UNINSTALL_OUTPUT_SCHEMA, render: renderUninstall },
      execute: async (args) => uninstallSkill(args ?? {}),
    }),
  ];
}
