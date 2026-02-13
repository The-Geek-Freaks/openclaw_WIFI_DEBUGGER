#!/usr/bin/env python3
"""SSH helper for Windows - replaces sshpass functionality using paramiko"""
import sys
import paramiko

def main():
    if len(sys.argv) < 5:
        print("Usage: ssh-helper.py <host> <user> <password> <command>", file=sys.stderr)
        sys.exit(1)
    
    host = sys.argv[1]
    user = sys.argv[2]
    password = sys.argv[3]
    command = sys.argv[4]
    
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(host, username=user, password=password, timeout=15)
        
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode()
        err = stderr.read().decode()
        exit_code = stdout.channel.recv_exit_status()
        
        client.close()
        
        print(out, end='')
        if err:
            print(err, end='', file=sys.stderr)
        
        sys.exit(exit_code)
    except paramiko.AuthenticationException:
        print("Authentication failed", file=sys.stderr)
        sys.exit(255)
    except paramiko.SSHException as e:
        print(f"SSH error: {e}", file=sys.stderr)
        sys.exit(255)
    except Exception as e:
        print(f"Connection error: {e}", file=sys.stderr)
        sys.exit(255)

if __name__ == "__main__":
    main()
