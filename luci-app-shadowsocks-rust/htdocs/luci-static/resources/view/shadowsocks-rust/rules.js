'use strict';
'require view';
'require form';
'require rpc';
'require uci';

var callHostHints = rpc.declare({
    object: 'luci-rpc',
    method: 'getHostHints',
    expect: { '': {} }
});

var callNetworkDevices = rpc.declare({
    object: 'luci-rpc',
    method: 'getNetworkDevices',
    expect: { '': {} }
});

function localLabel(s) {
    var name = s.name || s['.name'];
    var port = s.local_port || '?';
    var proto = s.protocol || 'socks';

    return '%s (%s :%s)'.format(name, proto, port);
}

function enabledLocals(protocol) {
    return uci.sections('shadowsocks-rust', 'local').filter(function(s) {
        if (s.enabled != '1')
            return false;

        if (protocol && s.protocol != protocol)
            return false;

        return true;
    });
}

function addDnsOptions(o) {
    enabledLocals('dns').forEach(function(s) {
        var port = s.local_port;

        if (!port)
            return;

        o.value('127.0.0.1:' + port, localLabel(s));
    });
}

// Build one choice per address of every host known to the system. The hints
// combine DHCP leases, ARP and IPv6 neighbour entries and wireless clients,
// so the list reflects the devices that are currently known on the LAN.
// Addresses of the router's own interfaces are skipped.
function addDeviceOptions(o, hosts, devices) {
    var local = { };
    var seen = { };
    var entries = [ ];

    Object.keys(devices || { }).forEach(function(name) {
        var mac = devices[name] && devices[name].mac;

        if (mac)
            local[mac.toLowerCase()] = true;
    });

    Object.keys(hosts || { }).forEach(function(mac) {
        if (local[mac.toLowerCase()])
            return;

        var host = hosts[mac] || { };
        var name = host.name || mac;
        var addrs = [ ];

        L.toArray(host.ipaddrs || host.ipv4).forEach(function(ip) {
            addrs.push(ip);
        });

        L.toArray(host.ip6addrs || host.ipv6).forEach(function(ip) {
            // Link-local and multicast addresses are never a useful source
            // match for proxied traffic.
            if (!ip || /^(fe80:|ff|::1$)/i.test(ip))
                return;

            addrs.push(ip);
        });

        addrs.forEach(function(ip) {
            if (!ip || seen[ip])
                return;

            seen[ip] = true;
            entries.push({ value: ip, label: name + ' (' + ip + ')' });
        });
    });

    entries.sort(function(a, b) {
        return L.naturalCompare(a.label, b.label);
    });

    entries.forEach(function(e) {
        o.value(e.value, e.label);
    });
}

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('shadowsocks-rust'),
            L.resolveDefault(callHostHints(), { }),
            L.resolveDefault(callNetworkDevices(), { })
        ]);
    },

    render: function(data) {
        var m, s, o;
        var hosts = data[1] || { };
        var devices = data[2] || { };

        m = new form.Map('shadowsocks-rust', _('Shadowsocks-Rust'),
            _('Transparent proxy and DNS settings'));

        s = m.section(form.NamedSection, 'settings', 'rules', _('Rules'),
            _('Policy, source and destination rules'));
        s.anonymous = true;
        s.tab('policy', _('Policy'));
        s.tab('sources', _('Source Rules'));
        s.tab('destinations', _('Destination Rules'));

        o = s.taboption('policy', form.Flag, 'enabled', _('Apply TProxy Rules'),
            _('Install the route, nftables and dnsmasq rules. Off starts sslocal only.'));
        o.rmempty = false;

        o = s.taboption('policy', form.ListValue, 'tproxy_local', _('TProxy Local'),
            _('Enabled redir local that nftables sends proxied traffic to.'));
        var redirs = enabledLocals('redir');
        if (redirs.length) {
            redirs.forEach(function(s) {
                o.value(s['.name'], localLabel(s));
            });
        } else {
            o.value('', _('No enabled redir local'));
        }
        o.rmempty = false;
        o.validate = function(section_id, value) {
            var apply = this.section.getUIElement(section_id, 'enabled');
            var on = apply ? apply.getValue() : null;

            if ((on === '1' || on === true) && !value)
                return _('Add and enable a redir local under Basic Settings first');

            return true;
        };

        o = s.taboption('policy', form.Flag, 'dns_hijack', _('Hijack LAN DNS'),
            _('Redirect DNS queries from LAN clients here, so they follow the domain rules.'));
        o.default = o.enabled;
        o.rmempty = false;

        o = s.taboption('policy', form.Value, 'proxy_domain_dns', _('Proxy Domain DNS'),
            _('Resolver used for the proxy domains. Leave empty for the system resolvers, pick an enabled DNS local, or enter an ip:port.'));
        addDnsOptions(o);
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('System DNS');
        o.rmempty = true;

        o = s.taboption('policy', form.Value, 'bypass_domain_dns', _('Bypass Domain DNS'),
            _('Resolver used for the bypass domains. Leave empty for the system resolvers, pick an enabled DNS local, or enter an ip:port.'));
        addDnsOptions(o);
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('System DNS');
        o.rmempty = true;

        o = s.taboption('policy', form.Value, 'other_domain_dns', _('Other Domains DNS'),
            _('Resolver for the domains not matched by the lists. When set it replaces the system DNS, leave empty to use the system resolvers.'));
        addDnsOptions(o);
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('System DNS');
        o.rmempty = true;

        o = s.taboption('policy', form.ListValue, 'src_default', _('Default for Source IPs'),
            _('For clients not listed in the source tabs.'));
        o.value('accept', _('Direct'));
        o.value('checkdst', _('Check Destination'));
        o.value('forward', _('Proxy All'));
        o.default = 'accept';
        o.rmempty = false;

        o = s.taboption('policy', form.ListValue, 'dst_default', _('Default for Destinations'),
            _('For destinations not matched by the domain and IP lists.'));
        o.value('accept', _('Direct'));
        o.value('forward', _('Proxy'));
        o.default = 'accept';
        o.rmempty = false;

        o = s.taboption('policy', form.ListValue, 'local_default', _('Router Traffic'),
            _('For connections made by the router itself.'));
        o.value('none', _('Direct'));
        o.value('checkdst', _('Check Destination'));
        o.value('forward', _('Proxy All'));
        o.default = 'none';
        o.rmempty = false;

        o = s.taboption('policy', form.Value, 'refresh_hours', _('Lists Refresh Interval'),
            _('Hours between two downloads of the remote lists, 0 only once at start.'));
        o.datatype = 'range(0,8760)';
        o.default = '24';
        o.placeholder = '24';
        o.rmempty = false;

        o = s.taboption('sources', form.MultiValue, 'src_bypass', _('Source Bypass'),
            _('LAN devices that are always direct. Pick from the known LAN devices; custom IP/CIDR entries are accepted too.'));
        o.create = true;
        o.rmempty = true;
        o.optional = true;
        addDeviceOptions(o, hosts, devices);

        o = s.taboption('sources', form.MultiValue, 'src_forward', _('Source Forward'),
            _('LAN devices that are always proxied. Pick from the known LAN devices; custom IP/CIDR entries are accepted too.'));
        o.create = true;
        o.rmempty = true;
        o.optional = true;
        addDeviceOptions(o, hosts, devices);

        o = s.taboption('sources', form.MultiValue, 'src_checkdst', _('Source Check Destination'),
            _('LAN devices matched against the destination rules. Pick from the known LAN devices; custom IP/CIDR entries are accepted too.'));
        o.create = true;
        o.rmempty = true;
        o.optional = true;
        addDeviceOptions(o, hosts, devices);

        o = s.taboption('destinations', form.DynamicList, 'proxy_domain', _('Proxy Domain'),
            _('Domains and subdomains whose traffic goes through the tunnel.'));
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'proxy_domain_url', _('Proxy Domain URL'),
            _('Text files with one domain per line, added to the list above.'));
        o.placeholder = 'https://example.com/proxy-domains.txt';
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'proxy_ipset', _('Proxy IP Set'),
            _('IP/CIDR ranges always proxied.'));
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'proxy_ipset_url', _('Proxy IP Set URL'),
            _('Text files with one IP or CIDR per line (# comments allowed), added to the list above.'));
        o.placeholder = 'https://example.com/proxy-ips.txt';
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'bypass_domain', _('Bypass Domain'),
            _('Domains and subdomains resolved directly.'));
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'bypass_domain_url', _('Bypass Domain URL'),
            _('Text files with one domain per line, added to the list above.'));
        o.placeholder = 'https://example.com/bypass-domains.txt';
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'bypass_ipset', _('Bypass IP Set'),
            _('IP/CIDR ranges always direct.'));
        o.rmempty = true;
        o.optional = true;

        o = s.taboption('destinations', form.DynamicList, 'bypass_ipset_url', _('Bypass IP Set URL'),
            _('Text files with one IP or CIDR per line (# comments allowed), added to the list above.'));
        o.placeholder = 'https://example.com/bypass-ips.txt';
        o.rmempty = true;
        o.optional = true;

        return m.render();
    }
});
