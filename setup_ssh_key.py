import paramiko

pubkey = open('C:/Users/Shadow-PC/.ssh/id_rsa.pub').read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.178.3', username='admin', password='Mel21isas', timeout=10)

# Check if key already exists
stdin, stdout, stderr = c.exec_command('cat /tmp/home/root/.ssh/authorized_keys 2>/dev/null || echo EMPTY')
existing = stdout.read().decode()

if pubkey in existing:
    print('Key already installed')
else:
    # Add key
    stdin, stdout, stderr = c.exec_command('mkdir -p /tmp/home/root/.ssh && chmod 700 /tmp/home/root/.ssh')
    stdout.read()
    stdin, stdout, stderr = c.exec_command(f'echo "{pubkey}" >> /tmp/home/root/.ssh/authorized_keys && chmod 600 /tmp/home/root/.ssh/authorized_keys')
    stdout.read()
    print('Key installed successfully')

c.close()
