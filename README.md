# IP/VPN Indicator for GNOME Shell

A simple GNOME Shell extension that displays your current IP address in the top panel, with automatic detection of VPN connections and network interface types.

## Features

- **Automatic IP Detection**: Shows your current private IP address
- **VPN Detection**: Automatically detects and displays VPN connections (OpenVPN via `tun0`)
- **Tailscale Support**: Detects Tailscale exit nodes and displays the node name
- **Interface Type Detection**: Different icons for WiFi and Ethernet connections
- **Auto-refresh**: Updates every 5 seconds to reflect network changes

## Icons

The extension uses different icons to indicate your connection type:

-  **WiFi** - Connected via wireless interface
- 󰈀 **Ethernet** - Connected via wired interface
- 󰌘 **VPN** - VPN connection active (`tun0` or Tailscale exit node)
- 󰈂 **No Internet** - No active network connection

## Installation

### Manual Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/notj0n/ip-vpn-indicator.git
   ```

2. Copy the extension to your GNOME extensions directory:

   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/
   cp -r ip-vpn-indicator@notj0n ~/.local/share/gnome-shell/extensions/
   ```

3. Restart GNOME Shell:
   - **X11**: Press `Alt+F2`, type `r`, and press Enter
   - **Wayland**: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable ip-vpn-indicator@notj0n
   ```

### Using GNOME Extensions Website

Coming soon!

## Requirements

- GNOME Shell 45, 46, or 47
- `ip` command (from iproute2 package, usually pre-installed)
- `tailscale` (optional, only needed for Tailscale detection)

## Supported VPN Types

- **OpenVPN** - Detects via `tun0` interface
- **Tailscale** - Detects active exit nodes

Other VPN types that create a `tun0` interface should also be detected.

## Configuration

Currently, the extension has no configuration options. It automatically:

- Checks for VPN connections every 5 seconds
- Prioritizes VPN IP over regular IP
- Detects the default network interface automatically

## Development

### Project Structure

```
ip-vpn-indicator@notj0n/
├── extension.js      # Main extension code
└── metadata.json     # Extension metadata
```

### Debugging

View extension logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i "ip-vpn"
```

Use GNOME Shell's Looking Glass debugger:

1. Press `Alt+F2`
2. Type `lg` and press Enter
3. Navigate to the Extensions tab

## Compatibility

Tested on:

- GNOME Shell 46

Should work on most Linux distributions running GNOME Shell.

## Troubleshooting

### Extension doesn't appear after installation

1. Verify the extension is in the correct directory:

   ```bash
   ls ~/.local/share/gnome-shell/extensions/ip-vpn-indicator@notj0n/
   ```

2. Check if GNOME Shell detected it:

   ```bash
   gnome-extensions list
   ```

3. Look for errors in logs:
   ```bash
   journalctl -b 0 /usr/bin/gnome-shell | grep -i error
   ```

### Extension shows "No IP"

- Verify you have an active network connection
- Check if the `ip` command is available: `which ip`
- Try manually running: `ip route get 1.1.1.1`

### VPN not detected

- For OpenVPN: Verify your VPN creates a `tun0` interface: `ip addr show tun0`
- For Tailscale: Ensure `tailscale` is installed and you're using an exit node
- Check if Tailscale is running: `tailscale status`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Ideas for Future Features

- [ ] Click to copy IP to clipboard
- [ ] Support for more VPN types (WireGuard, etc.)
- [ ] Show both IPv4 and IPv6
- [ ] Configurable refresh interval
- [ ] Show public IP address option
- [ ] Network traffic statistics

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Jon Cvn - [@notj0n](https://github.com/notj0n)

## Support

If you find this extension useful, please consider:

- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 🔧 Contributing code
