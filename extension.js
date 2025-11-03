import GObject from "gi://GObject";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const NetworkIndicator = GObject.registerClass(
  class NetworkIndicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, "IP/VPN Indicator");

      // Create label for the panel
      this._label = new St.Label({
        text: "...",
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "ip-vpn-label",
      });

      this.add_child(this._label);

      // Update immediately and then every 5 seconds
      this._updateIP();
      this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
        this._updateIP();
        return GLib.SOURCE_CONTINUE;
      });
    }

    _updateIP() {
      try {
        // Check for VPN first (tun0 interface)
        let vpnIP = this._getInterfaceIP("tun0");

        if (vpnIP) {
          this._label.set_text(`󰌘  ${vpnIP}`);
          return;
        }

        // Check for Tailscale
        let tailscaleInfo = this._checkTailscale();
        if (tailscaleInfo) {
          this._label.set_text(tailscaleInfo);
          return;
        }

        // Fall back to regular network interface
        let regularIPInfo = this._getRegularIP();
        if (regularIPInfo) {
          let icon = this._getInterfaceIcon(regularIPInfo.interface);
          this._label.set_text(`${icon} ${regularIPInfo.ip}`);
        } else {
          this._label.set_text("󰈂 No Internet");
        }
      } catch (e) {
        logError(e, "Error updating IP");
        this._label.set_text("󰈂 Error");
      }
    }

    _getInterfaceIP(interface_name) {
      try {
        let [, stdout] = GLib.spawn_command_line_sync(
          `ip -o -4 addr show dev ${interface_name}`,
        );

        let output = new TextDecoder().decode(stdout).trim();
        if (!output) return null;

        // Parse: "2: tun0    inet 10.8.0.2/24 ..."
        let match = output.match(/inet\s+([0-9.]+)\//);
        if (match && match[1]) {
          return match[1];
        }
      } catch (e) {
        // Interface doesn't exist or error occurred
        return null;
      }
      return null;
    }

    _checkTailscale() {
      try {
        // Check if tailscale is installed
        let [res] = GLib.spawn_command_line_sync("which tailscale");
        if (res !== 0) return null;

        // Check for exit node
        let [, stdout] = GLib.spawn_command_line_sync("tailscale status");
        let output = new TextDecoder().decode(stdout);

        // Look for exit node line
        let lines = output.split("\n");
        let exitNodeLine = lines.find((line) => line.includes("; exit node"));

        if (exitNodeLine) {
          // Extract the exit node name (second field)
          let parts = exitNodeLine.trim().split(/\s+/);
          if (parts.length >= 2) {
            return `󰌘  ${parts[1]}`;
          }
        }
      } catch (e) {
        return null;
      }
      return null;
    }

    _getInterfaceIcon(interface_name) {
      // WiFi interfaces usually start with 'wl' or 'wlan'
      if (interface_name.startsWith("wl")) {
        return "  "; // WiFi icon
      }
      // Ethernet interfaces usually start with 'en', 'eth', 'enp'
      if (interface_name.startsWith("en") || interface_name.startsWith("eth")) {
        return "󰈀 "; // Ethernet icon
      }
      // Default network icon
      return "󰈀 ";
    }

    _getRegularIP() {
      try {
        // Get default route interface
        let [, stdout] = GLib.spawn_command_line_sync("ip route get 1.1.1.1");

        let output = new TextDecoder().decode(stdout).trim();
        let match = output.match(/dev\s+(\S+)/);

        if (match && match[1]) {
          let interface_name = match[1];
          let ip = this._getInterfaceIP(interface_name);
          if (ip) {
            return { ip: ip, interface: interface_name };
          }
        }
      } catch (e) {
        logError(e, "Error getting regular IP");
      }
      return null;
    }

    destroy() {
      if (this._timeout) {
        GLib.source_remove(this._timeout);
        this._timeout = null;
      }
      super.destroy();
    }
  },
);

export default class IPVPNExtension extends Extension {
  enable() {
    this._indicator = new NetworkIndicator();
    Main.panel.addToStatusArea("ip-vpn-indicator", this._indicator);
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
}
