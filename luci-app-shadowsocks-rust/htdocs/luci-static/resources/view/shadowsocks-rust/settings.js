'use strict';
'require view';
'require form';
'require rpc';

return view.extend({
    callStatus: rpc.declare({
        object: "service",
        method: "list",
        params: ["name"],
        expect: { "shadowsocks-rust": {} }
    }),

    load: function() {
        return Promise.all([this.callStatus()]);
    },

    render: function (data) {
        var m, s, o;

        m = new form.Map('shadowsocks-rust', _('Shadowsocks-Rust'),
            _('Transparent proxy and DNS settings'));

        // Service Settings
        s = m.section(form.NamedSection, 'main', 'conf', _('Service Settings'));
        s.anonymous = true;

        // Runtime status (read-only)
        o = s.option(form.DummyValue, '_running', _('Service Status'));
        o.cfgvalue = function () {
            try {
                return data[0]["instances"]["shadowsocks-rust"]["running"]
                    ? _('Running') : _('Stopped');
            } catch (e) {
                return _('Stopped');
            }
        };

        // Enabled: bound to the UCI 'enabled' option, so saving it always
        // reflects the configured state and always produces a change.
        o = s.option(form.Flag, 'enabled', _('Enabled'),
            _('Allow the service to start. When off, sslocal and the rules are not started.'));
        o.rmempty = false;

        // Local listeners (socks / http / redir / dns)
        s = m.section(form.GridSection, 'local', _('Local Service'),
            _('Local listeners for sslocal (SOCKS, HTTP, redir, DNS).'));
        s.anonymous = true;
        s.addremove = true;
        s.nodescriptions = true;

        o = s.option(form.Flag, 'enabled', _('Enabled'));
        o.editable = true;
        o.default = o.enabled;
        // Without this, LuCI drops enabled='1' on save (value == default + rmempty),
        // and the init script then skips every local listener.
        o.rmempty = false;

        o = s.option(form.Value, 'name', _('Name'),
            _('Optional label shown in the Rules dropdowns.'));
        o.rmempty = true;

        o = s.option(form.ListValue, 'protocol', _('Protocol'));
        o.value('socks', _('SOCKS5'));
        o.value('http', _('HTTP'));
        o.value('redir', _('Redir (TProxy)'));
        o.value('dns', _('DNS'));
        o.rmempty = false;

        o = s.option(form.Value, 'local_address', _('Listen Address'));
        o.datatype = 'ipaddr';
        o.placeholder = '::';
        o.default = '::';
        o.rmempty = true;
        o.modalonly = true;

        o = s.option(form.Value, 'local_port', _('Port'));
        o.datatype = 'port';
        o.rmempty = false;

        o = s.option(form.ListValue, 'tcp_redir', _('TCP Redir Mode'));
        o.value('tproxy', 'tproxy');
        o.value('redirect', 'redirect');
        o.default = 'tproxy';
        o.depends('protocol', 'redir');
        o.modalonly = true;

        o = s.option(form.ListValue, 'udp_redir', _('UDP Redir Mode'));
        o.value('tproxy', 'tproxy');
        o.default = 'tproxy';
        o.depends('protocol', 'redir');
        o.modalonly = true;

        o = s.option(form.Value, 'dns_remote_addr', _('DNS Remote Server'),
            _('Upstream DNS for this relay, queried through the tunnel.'));
        o.datatype = 'ipaddr';
        o.placeholder = '1.1.1.1';
        o.depends('protocol', 'dns');
        o.modalonly = true;
        o.rmempty = false;

        // Advanced Settings
        s = m.section(form.NamedSection, 'global', 'settings', _('Advanced Settings'));
        s.anonymous = true;

        o = s.option(form.ListValue, 'runtime_mode', _('Runtime Mode'),
            _('Multi-thread uses one Tokio worker per CPU core. Single-thread uses less memory on small routers.'));
        o.value('multi_thread', _('Multi-thread'));
        o.value('single_thread', _('Single-thread'));
        o.default = 'multi_thread';
        o.rmempty = false;

        o = s.option(form.Value, 'client_cache_size', _('DNS Client Cache Size'),
            _('Idle upstream DNS connections kept per resolver. Answers are cached by dnsmasq.'));
        o.datatype = 'range(8,4096)';
        o.rmempty = false;

        o = s.option(form.Flag, 'no_delay', _('TCP No Delay'),
            _('Disable Nagle for lower latency at the cost of more packets.'));
        o.rmempty = false;

        o = s.option(form.Value, 'keep_alive', _('TCP Keep Alive'),
            _('Keepalive probe interval in seconds, used to drop dead connections.'));
        o.datatype = 'range(5,180)';
        o.rmempty = false;

        o = s.option(form.Flag, 'fast_open', _('TCP Fast Open'),
            _('Requires kernel and server support.'));
        o.rmempty = false;

        o = s.option(form.Flag, 'mptcp', _('TCP MPTCP'),
            _('Requires kernel, server and multiple paths.'));
        o.rmempty = false;

        o = s.option(form.Value, 'nofile', _('Open File Limit'),
            _('Each proxied connection uses two descriptors.'));
        o.datatype = 'range(512,20480)';
        o.rmempty = false;

        o = s.option(form.ListValue, 'log_level', _('Log Level'),
            _('Log verbosity written to syslog.'));
        o.value('info', _('Info'));
        o.value('debug', _('Debug'));
        o.value('trace', _('Trace'));
        o.default = 'info';
        o.rmempty = false;

        return m.render();
    }
});
