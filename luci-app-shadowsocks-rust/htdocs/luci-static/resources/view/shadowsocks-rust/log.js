'use strict';
'require fs';
'require poll';
'require ui';
'require view';

return view.extend({
	retrieveLog: async function() {
		return Promise.all([
			L.resolveDefault(fs.stat('/sbin/logread'), null),
			L.resolveDefault(fs.stat('/usr/sbin/logread'), null)
		]).then(function(stat) {
			var logger = stat[0] ? stat[0].path : stat[1] ? stat[1].path : null;

			return fs.exec_direct(logger, [ '-e', 'sslocal' ]).then(logdata => {
				const loglines = logdata.trim().split(/\n/).map(function(log) {
					var logParts = log.split(' ').filter(Boolean);
					if (logParts.length >= 7) {
						var message = logParts.slice(7).join(' ');
						return '[ ' + logParts[5] + ' ] ' + message;
					} else {
						return 'Log is empty.';
					}
				}).filter(Boolean);
				return { value: loglines.join('\n'), rows: loglines.length + 1 };
			}).catch(function(err) {
				ui.addNotification(null, E('p', {}, _('Unable to load log data: ' + err.message)));
				return '';
			});
		});
	},

	pollLog: async function() {
		const element = document.getElementById('syslog');
		if (element) {
			const log = await this.retrieveLog();
			element.value = log.value;
			element.rows = log.rows;
		}
	},

	load: async function() {
		poll.add(this.pollLog.bind(this));
		return await this.retrieveLog();
	},

	render: function(loglines) {
		var scrollDownButton = E('button', { 
				'id': 'scrollDownButton',
				'class': 'cbi-button cbi-button-neutral'
			}, _('Scroll to tail', 'scroll to bottom (the tail) of the log file')
		);
		scrollDownButton.addEventListener('click', function() {
			scrollUpButton.scrollIntoView();
		});

		var scrollUpButton = E('button', { 
				'id' : 'scrollUpButton',
				'class': 'cbi-button cbi-button-neutral'
			}, _('Scroll to head', 'scroll to top (the head) of the log file')
		);
		scrollUpButton.addEventListener('click', function() {
			scrollDownButton.scrollIntoView();
		});

		return E([], [
			E('div', { 'id': 'content_syslog' }, [
				E('div', {'style': 'padding-bottom: 20px'}, [scrollDownButton]),
				E('textarea', {
					'id': 'syslog',
					'style': 'font-size:12px',
					'readonly': 'readonly',
					'wrap': 'off',
					'rows': loglines.rows,
				}, [ loglines.value ]),
				E('div', {'style': 'padding-bottom: 20px'}, [scrollUpButton])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
