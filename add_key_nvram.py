import paramiko

pubkey = open('C:/Users/Shadow-PC/.ssh/id_rsa.pub').read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.178.3', username='admin', password='Mel21isas', timeout=10)

# Get current keys
stdin, stdout, stderr = c.exec_command('nvram get sshd_authkeys')
current = stdout.read().decode().strip()

if pubkey in current:
    print('Key already in nvram')
else:
    # Append key - use a simpler approach
    stdin, stdout, stderr = c.exec_command(f'echo "{pubkey}" >> /jffs/.ssh/authorized_keys 2>/dev/null || mkdir -p /jffs/.ssh && echo "{pubkey}" >> /jffs/.ssh/authorized_keys')
    stdout.read()
    stderr.read()
    
    # Also try dropbear location
    stdin, stdout, stderr = c.exec_command(f'echo "{pubkey}" >> /etc/dropbear/authorized_keys 2>/dev/null')
    stdout.read()
    
    print('Key added to /jffs/.ssh/authorized_keys and /etc/dropbear/')

c.close()
