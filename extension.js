import GObject from "gi://GObject";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import NM from "gi://NM";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Interfaces treated as a "VPN tunnel" for priority display. Tailscale is
// handled separately (it needs the `tailscale` CLI to resolve the exit node).
function isVpnInterface(iface) {
  if (!iface || iface.startsWith("tailscale")) return false;
  return (
    iface.startsWith("tun") ||
    iface.startsWith("wg") ||
    iface.startsWith("nordlynx")
  );
}

const NetworkIndicator = GObject.registerClass(
  class NetworkIndicator extends PanelMenu.Button {
    _init(settings, client) {
      super._init(0.0, "IP/VPN Indicator");

      this._settings = settings;
      this._client = client;

      // Label for the panel.
      this._label = new St.Label({
        text: "…",
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "ip-vpn-label",
      });
      this.add_child(this._label);

      // Detect the tailscale binary once at startup (a cheap PATH lookup, no
      // subprocess) instead of running `which tailscale` on every refresh.
      this._hasTailscale = GLib.find_program_in_path("tailscale") !== null;

      // Guard so overlapping refreshes never stack subprocess spawns.
      this._updating = false;
      this._pendingUpdate = false;

      // Coalesce bursts of NM signals into a single update.
      this._debounceId = 0;

      // React to NetworkManager state changes: this replaces the old 5s poll,
      // so the common "regular IP" path never spawns anything. Signals are
      // tracked by owner (`this`) so cleanup is a single disconnectObject call.
      const onChange = () => this._queueUpdate();
      this._client.connectObject(
        "notify::primary-connection", onChange,
        "notify::connectivity", onChange,
        "notify::active-connections", onChange,
        "any-device-added", onChange,
        "any-device-removed", onChange,
        this,
      );

      // Slow safety-net timer, mainly to keep the Tailscale exit node fresh
      // (it can change with no NM event). Reads NM state cheaply; only spawns
      // when a Tailscale/unmanaged tunnel is actually present.
      this._refreshId = 0;
      this._startRefreshTimer();
      this._settings.connectObject(
        "changed::refresh-interval",
        () => this._startRefreshTimer(),
        this,
      );

      // First paint.
      this._queueUpdate();
    }

    _startRefreshTimer() {
      if (this._refreshId) {
        GLib.source_remove(this._refreshId);
        this._refreshId = 0;
      }
      const interval = this._settings.get_int("refresh-interval");
      this._refreshId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        interval,
        () => {
          this._queueUpdate();
          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    _queueUpdate() {
      if (this._debounceId) return;
      this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        this._debounceId = 0;
        this._update();
        return GLib.SOURCE_REMOVE;
      });
    }

    async _update() {
      if (this._updating) {
        this._pendingUpdate = true;
        return;
      }
      this._updating = true;
      try {
        this._label.set_text(await this._computeText());
      } catch (e) {
        logError(e, "IP/VPN Indicator: update failed");
        this._label.set_text("󰈂 Error");
      } finally {
        this._updating = false;
        if (this._pendingUpdate) {
          this._pendingUpdate = false;
          this._queueUpdate();
        }
      }
    }

    async _computeText() {
      // 1. VPN tunnel (tun/wg/…), highest priority.
      const vpnIP = await this._getVpnIP();
      if (vpnIP) return `󰌘  ${vpnIP}`;

      // 2. Tailscale exit node.
      const tailscaleInfo = await this._getTailscaleExitNode();
      if (tailscaleInfo) return tailscaleInfo;

      // 3. Regular primary connection, straight from NetworkManager (no spawn).
      const regular = this._getPrimaryIP();
      if (regular) return `${regular.ip} (${regular.interface})`;

      return "󰈂 No Internet";
    }

    _findDevice(predicate) {
      const devices = this._client.get_all_devices();
      for (const dev of devices) {
        if (predicate(dev.get_iface() || "")) return dev;
      }
      return null;
    }

    _addressFromConfig(ip4config) {
      if (!ip4config) return null;
      const addrs = ip4config.get_addresses();
      if (addrs && addrs.length > 0) return addrs[0].get_address();
      return null;
    }

    _getPrimaryIP() {
      const active = this._client.get_primary_connection();
      if (!active) return null;
      const ip = this._addressFromConfig(active.get_ip4_config());
      if (!ip) return null;
      const devices = active.get_devices();
      const iface =
        devices && devices.length > 0 ? devices[0].get_iface() : "";
      return { ip, interface: iface };
    }

    async _getVpnIP() {
      const dev = this._findDevice(isVpnInterface);
      if (!dev) return null;

      // NM-managed VPN (e.g. NM's OpenVPN/WireGuard plugin) exposes the tunnel
      // address directly — no subprocess needed.
      const managed = this._addressFromConfig(dev.get_ip4_config());
      if (managed) return managed;

      // Unmanaged tunnel (e.g. openvpn CLI): NM has no address for it, so read
      // it with a single `ip` call. Only reached when a tunnel is up.
      return await this._getIfaceIPViaIp(dev.get_iface());
    }

    async _getTailscaleExitNode() {
      if (!this._hasTailscale) return null;
      // Skip the spawn entirely unless the tailscale interface is up.
      if (!this._findDevice((iface) => iface.startsWith("tailscale")))
        return null;

      const output = await this._execCommand(["tailscale", "status"]);
      if (!output) return null;

      const line = output
        .split("\n")
        .find((l) => l.includes("; exit node"));
      if (!line) return null;

      const parts = line.trim().split(/\s+/);
      return parts.length >= 2 ? `󰌘  ${parts[1]}` : null;
    }

    async _getIfaceIPViaIp(iface) {
      const output = await this._execCommand([
        "ip",
        "-o",
        "-4",
        "addr",
        "show",
        "dev",
        iface,
      ]);
      if (!output) return null;
      const match = output.match(/inet\s+([0-9.]+)\//);
      return match && match[1] ? match[1] : null;
    }

    async _execCommand(argv) {
      try {
        const proc = Gio.Subprocess.new(
          argv,
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );

        const [stdout] = await new Promise((resolve, reject) => {
          proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
              const [, stdout, stderr] = proc.communicate_utf8_finish(res);
              resolve([stdout, stderr]);
            } catch (e) {
              reject(e);
            }
          });
        });

        if (proc.get_successful()) {
          return stdout ? stdout.trim() : "";
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    destroy() {
      if (this._debounceId) {
        GLib.source_remove(this._debounceId);
        this._debounceId = 0;
      }
      if (this._refreshId) {
        GLib.source_remove(this._refreshId);
        this._refreshId = 0;
      }
      this._settings.disconnectObject(this);
      this._client.disconnectObject(this);
      super.destroy();
    }
  },
);

export default class IPVPNExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._cancellable = new Gio.Cancellable();

    // Creating the NM client is async; build the indicator once it is ready.
    NM.Client.new_async(this._cancellable, (_obj, res) => {
      let client;
      try {
        client = NM.Client.new_finish(res);
      } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
          logError(e, "IP/VPN Indicator: failed to create NetworkManager client");
        return;
      }
      // The extension may have been disabled while we were waiting.
      if (!this._settings) return;

      this._client = client;
      this._indicator = new NetworkIndicator(this._settings, client);
      Main.panel.addToStatusArea("ip-vpn-indicator", this._indicator);
    });
  }

  disable() {
    if (this._cancellable) {
      this._cancellable.cancel();
      this._cancellable = null;
    }
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
    this._client = null;
    this._settings = null;
  }
}
