# Complete System Lockdown Guide (SSH Only)

This guide provides a deployment-ready script designed to secure your robot's operating system by disabling unnecessary services and physical storage mounts, leaving only the SSH server active for remote management.

### 🛡️ Service Optimization & Access Restriction Script (`lockdown_system.sh`)

Create a file named `lockdown_system.sh`, paste the following bash script into it, and execute it with root privileges (e.g., `sudo bash lockdown_system.sh`).

```bash
#!/bin/bash

# 1. Disable Network File Services (FTP, Samba, NFS)
echo "[INFO] Disabling network file services..."
systemctl stop vsftpd samba-ad-dc smbd nfs-kernel-server &> /dev/null
systemctl disable vsftpd samba-ad-dc smbd nfs-kernel-server &> /dev/null

# 2. Disable Remote Desktop Services (VNC, RDP)
echo "[INFO] Disabling remote desktop services..."
systemctl stop xrdp vncserver &> /dev/null
systemctl disable xrdp vncserver &> /dev/null

# 3. Disable USB Storage (Mass Storage Driver Blacklisting)
# This prevents USB sticks from being mounted as drives.
echo "[INFO] Disabling USB Storage access..."
cat << 'EOF' > /etc/modprobe.d/disable-usb-storage.conf
blacklist usb-storage
blacklist uas
EOF
# Apply blacklist immediately
modprobe -r usb-storage uas &> /dev/null

# 4. Firewall Setup (UFW)
# Allow only SSH (22) and block everything else
echo "[INFO] Configuring firewall to allow ONLY SSH..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

# 5. SSH Hardening (Optional but Recommended)
# Disable Root Login via SSH
sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

echo "--------------------------------------------------"
echo "[SUCCESS] System Lockdown Completed."
echo "[INFO] Allowed: SSH (Port 22)"
echo "[INFO] Blocked: FTP, Samba, NFS, VNC, RDP, USB Storage"
echo "--------------------------------------------------"
```

### 📝 Detailed Explanation

*   **Network File Services**: Disables `vsftpd` (FTP), `samba`/`smbd` (Windows File Sharing), and `nfs-kernel-server` (NFS) to prevent unauthorized file access over the network.
*   **Remote Desktop Services**: Disables `xrdp` and `vncserver` to prevent remote UI takeover.
*   **USB Storage Blacklisting**: Creates a kernel module blacklist for `usb-storage` and `uas`. This physically protects the system from "BadUSB" or unauthorized data exfiltration via USB mass storage devices.
*   **Firewall (UFW)**: Enables the Uncomplicated Firewall (UFW), setting the default policy to deny all incoming traffic and only allowing TCP port 22 (SSH).
*   **SSH Hardening**: Modifies the `/etc/ssh/sshd_config` file to explicitly prevent the `root` user from logging in via SSH, forcing users to use a standard account and authenticate via `sudo`.