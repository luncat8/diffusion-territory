// owns: shareable URL persistence for GUI settings
// edit for: URL encoding, validation, or scene-relative defaults

const UrlSettings = {
	defaults: null,

	baseline(scene) {
		const base = {};
		Presets.copyRules(base, UrlSettings.defaults);
		Presets.apply(base, scene);
		return base;
	},

	fields() {
		const fields = [{ key: 'scene', min: 0, max: SCENES.length - 1, step: 1 },
			{ key: 'paused', min: 0, max: 1, step: 1 }, { key: 'paint', min: 0, max: 2, step: 1 },
			{ key: 'holdTarget', min: 5, max: 120, step: 5 },
			{ key: 'mixMask', min: 0, max: 7, step: 1 }, { key: 'reactMask', min: 0, max: 7, step: 1 },
			{ key: 'reactMode', min: 0, max: REACT_MODES.length - 1, step: 1 }];
		for (let i = 0; i < 3; i++) fields.push({ key: 'reactDir', index: i, min: 0, max: 1, step: 1 });
		for (const def of CONTROLS) {
			if (def.kind === 'rate') {
				for (let i = 0; i < 3; i++) fields.push({ key: def.key, index: i, min: 0, max: 100, step: 1 });
			} else fields.push(def);
		}
		return fields;
	},

	name(field) {
		return 'dt.' + field.key + (field.index === undefined ? '' : '.' + field.index);
	},

	value(settings, field) {
		return field.index === undefined ? settings[field.key] : settings[field.key][field.index];
	},

	load() {
		UrlSettings.defaults = {};
		Presets.copyRules(UrlSettings.defaults, Settings);
		const params = new URLSearchParams(location.protocol === 'file:' ? location.hash.split('?')[1] || '' : location.search);
		const fields = UrlSettings.fields();
		const values = [];
		for (const field of fields) {
			const raw = params.get(UrlSettings.name(field));
			if (raw === null || raw.trim() === '') continue;
			const value = Number(raw);
			if (!Number.isFinite(value) || value < field.min || value > field.max ||
				Math.abs((value - field.min) / field.step - Math.round((value - field.min) / field.step)) > 1e-7) continue;
			values.push([field, value]);
		}
		const scene = values.find(([field]) => field.key === 'scene');
		Presets.apply(Settings, scene ? scene[1] : 0);
		for (const [field, value] of values) {
			if (field.index === undefined) Settings[field.key] = value;
			else Settings[field.key][field.index] = value;
		}
	},

	save() {
		const url = new URL(location.href);
		const base = UrlSettings.baseline(Settings.scene);
		const file = url.protocol === 'file:';
		const fragment = file ? url.hash.split('?')[0] : '';
		const params = file ? new URLSearchParams(url.hash.split('?')[1] || '') : url.searchParams;
		for (const field of UrlSettings.fields()) {
			const name = UrlSettings.name(field);
			const value = UrlSettings.value(Settings, field);
			if (value === UrlSettings.value(base, field)) params.delete(name);
			else params.set(name, value);
		}
		// Scene is compared to the application default, not its own profile.
		if (Settings.scene) params.set('dt.scene', Settings.scene);
		else params.delete('dt.scene');
		if (file) {
			const query = params.toString();
			location.replace((fragment || '#') + (query ? '?' + query : ''));
		} else history.replaceState(null, '', url.href);
	},
};
