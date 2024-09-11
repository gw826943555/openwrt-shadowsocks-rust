'use strict';
'require view';
'require poll';
'require form';
'require uci';
'require fs';
'require network';
'require rpc';
'require shadowsocks-rust as ss';

var conf = 'shadowsocks-rust';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

return view.extend({
	render: function(stats) {
		var m, s, o;

		m = new form.Map(conf,
			_('Local Instances'),
			_('Instances of shadowsocks-rust components, e.g. ss-local, \
			   ss-redir, ss-tunnel, ss-server, etc.  To enable an instance it \
			   is required to enable both the instance itself and the remote \
			   server it refers to.'));

		s = m.section(form.GridSection, 'ss_local');
		s.addremove = true;
		s.sectiontitle = function(section_id) {
			var s = uci.get(conf, section_id, 'protocol');
			return (s ? s + '.' : '') + section_id;
		};
		s.renderSectionAdd = function(extra_class) {
			var el = form.GridSection.prototype.renderSectionAdd.apply(this, arguments)
			return el;
		};

		s.addModalOptions = function(s) {
			o = s.option(form.ListValue, 'protocol', _('Protocol'));
			o.value('socks', _('Socks'));
			o.value('redir', _('Redir'));
			o.value('dns', _('Dns'));
			o.rmempty = false;

			o = s.option(form.Value, 'local_address', _('Listening address'));
			o.datatype = 'host';
			o.default = '::';
			o.rmempty = false;

			o = s.option(form.Value, 'local_port', _('Port'));
			o.datatype = 'port';
			o.placeholder = '10086';
			o.rmempty = false;

			o = s.option(form.ListValue, 'mode', _('Mode'));
			o.value('tcp_only');
			o.value('udp_only');
			o.value('tcp_and_udp');
			o.default = 'tcp_and_udp';

			o = s.option(form.ListValue, 'tcp_redir', _('TCP Type'));
			o.value('redirect');
			o.value('tproxy');
			o.depends('protocol', 'redir');
			o.default = 'redirect';

			o = s.option(form.Value, 'local_dns_address', _('Local DNS address'));
			o.depends('protocol', 'dns');
			o.datatype = 'host';
			o.placeholder = '114.114.114.114';
			o.rmempty = false;

			o = s.option(form.Value, 'local_dns_port', _('Local DNS\'s port'));
			o.depends('protocol', 'dns');
			o.datatype = 'port';

			o = s.option(form.Value, 'remote_dns_address', _('Remote DNS address'));
			o.depends('protocol', 'dns');
			o.datatype = 'host';

			o = s.option(form.Value, 'remote_dns_port', _('Remote DNS\'s port'));
			o.depends('protocol', 'dns');
			o.datatype = 'port';

			o = s.option(form.Value, 'client_cache_size', _('dns client cache size'));
			o.depends('protocol', 'dns');
			o.datatype = 'uinteger';
		};

		o = s.option(form.DummyValue, 'overview', _('Overview'));
		o.modalonly = false;
		o.editable = true;
		o.rawhtml = true;
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var sdata = uci.get(conf, section_id);
			if (sdata) {
				return form.DummyValue.prototype.renderWidget.call(this, section_id, option_index, ss.cfgvalue_overview(sdata));
			}
			return null;
		};

		o = s.option(form.Button, 'disabled', _('Enable/Disable'));
		o.modalonly = false;
		o.editable = true;
		o.inputtitle = function(section_id) {
			var s = uci.get(conf, section_id);
			if (ss.ucival_to_bool(s['disabled'])) {
				this.inputstyle = 'reset';
				return _('Disabled');
			}
			this.inputstyle = 'save';
			return _('Enabled');
		}
		o.onclick = function(ev) {
			var inputEl = ev.target.parentElement.nextElementSibling;
			inputEl.value = ss.ucival_to_bool(inputEl.value) ? '0' : '1';
			return this.map.save();
		}

		return m.render();
	},
});
