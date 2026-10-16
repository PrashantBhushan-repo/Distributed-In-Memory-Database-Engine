import fs from 'fs';
import path from 'path';
let cachedConfigMeta = null;
export function loadConfigMetadata() {
    if (cachedConfigMeta)
        return cachedConfigMeta;
    const candidates = [
        path.resolve(process.cwd(), '../../packages/shared/config-meta.json'),
        path.resolve(process.cwd(), '../packages/shared/config-meta.json'),
        path.resolve(process.cwd(), 'packages/shared/config-meta.json'),
        'D:\\pbRedisDB\\packages\\shared\\config-meta.json',
        'C:\\Users\\prash\\OneDrive\\Desktop\\pbRedisDB\\packages\\shared\\config-meta.json',
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                cachedConfigMeta = JSON.parse(fs.readFileSync(p, 'utf-8'));
                return cachedConfigMeta;
            }
            catch (err) {
                console.error('Error parsing config-meta.json:', err);
            }
        }
    }
    return [];
}
export function validateConfigParam(param, value, metaList = loadConfigMetadata()) {
    const meta = metaList.find((m) => m.name.toLowerCase() === param.toLowerCase());
    const strVal = String(value ?? '').trim();
    if (!meta) {
        // If not in meta, allow standard string representation
        return { valid: true, normalizedValue: strVal };
    }
    if (!meta.mutableAtRuntime) {
        return {
            valid: false,
            error: `Parameter '${meta.name}' cannot be modified at runtime. It requires a server restart in redis.conf.`,
            normalizedValue: strVal,
        };
    }
    if (meta.type === 'boolean') {
        const lower = strVal.toLowerCase();
        if (['yes', '1', 'true', 'on'].includes(lower)) {
            return { valid: true, normalizedValue: 'yes' };
        }
        else if (['no', '0', 'false', 'off'].includes(lower)) {
            return { valid: true, normalizedValue: 'no' };
        }
        return { valid: false, error: `Invalid boolean for '${meta.name}'. Expected yes or no.`, normalizedValue: strVal };
    }
    if (meta.type === 'integer' || meta.type === 'bytes') {
        const num = Number(strVal);
        if (isNaN(num)) {
            return { valid: false, error: `Parameter '${meta.name}' must be a valid number.`, normalizedValue: strVal };
        }
        if (meta.min !== undefined && num < meta.min) {
            return { valid: false, error: `Parameter '${meta.name}' must be >= ${meta.min}.`, normalizedValue: strVal };
        }
        if (meta.max !== undefined && num > meta.max) {
            return { valid: false, error: `Parameter '${meta.name}' must be <= ${meta.max}.`, normalizedValue: strVal };
        }
        return { valid: true, normalizedValue: String(num) };
    }
    if (meta.type === 'enum' && meta.enumOptions) {
        if (!meta.enumOptions.includes(strVal)) {
            return {
                valid: false,
                error: `Invalid value for '${meta.name}'. Allowed options: ${meta.enumOptions.join(', ')}`,
                normalizedValue: strVal,
            };
        }
        return { valid: true, normalizedValue: strVal };
    }
    return { valid: true, normalizedValue: strVal };
}
export function generateRedisConfExport(items) {
    const lines = [
        '# ======================================================================',
        '# RedisX Studio Configuration Export (redis.conf)',
        `# Generated at: ${new Date().toISOString()}`,
        '# This file reflects current parameters with custom modifications.',
        '# ======================================================================',
        '',
    ];
    // Group items
    const groups = new Map();
    for (const item of items) {
        const g = item.group || 'General';
        const list = groups.get(g) || [];
        list.push(item);
        groups.set(g, list);
    }
    groups.forEach((groupItems, groupName) => {
        lines.push(`### ${groupName.toUpperCase()} ###`);
        for (const item of groupItems) {
            lines.push(`# ${item.description}`);
            if (!item.mutableAtRuntime) {
                lines.push('# Note: Requires restart to take effect');
            }
            // Mask password if requirepass
            const val = item.name === 'requirepass' && item.currentValue ? '********' : item.currentValue;
            lines.push(`${item.name} ${val}`);
            lines.push('');
        }
    });
    return lines.join('\n');
}
