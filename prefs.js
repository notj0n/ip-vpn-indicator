import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class IPVPNPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    // Create a preferences page
    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "dialog-information-symbolic",
    });
    window.add(page);

    // Create a preferences group
    const group = new Adw.PreferencesGroup({
      title: "Network Detection",
      description: "Configure how the extension detects your network",
    });
    page.add(group);

    // Refresh interval row
    const row = new Adw.SpinRow({
      title: "Refresh interval",
      subtitle:
        "Seconds between Tailscale / status refreshes. Regular network changes are detected instantly.",
      adjustment: new Gtk.Adjustment({
        lower: 5,
        upper: 600,
        step_increment: 5,
        page_increment: 30,
      }),
    });
    group.add(row);

    // Bind the setting
    settings.bind(
      "refresh-interval",
      row,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
  }
}
