/**
 * Reference import samples shown in the import dialog's "format help" panel.
 *
 * These live here, not in the component, so the same strings the UI advertises
 * are the strings the test parses — a sample that silently stopped being valid
 * would be worse than no sample at all.
 *
 * The headers are exactly the ones the CSV parser recognises. Only Name and
 * Host are required; the rest fall back to defaults (SSH, protocol port,
 * username "root"). Hosts are public example domains so a copy-paste import
 * does not immediately trip the SSRF check.
 */

/**
 * The sample as structured data — the single source the CSV, table preview and
 * downloadable spreadsheet template all derive from, so every format shows the
 * same three servers.
 */
export const SAMPLE_COLUMNS = [
    'Name',
    'Host',
    'Protocol',
    'Port',
    'Username',
    'Group',
    'Tags',
    'Password',
    'Private Key',
    'Key Passphrase',
    'Notes',
] as const;

export const SAMPLE_ROWS: (string | number)[][] = [
    ['prod-web', 'web.example.com', 'SSH', 22, 'deploy', 'Production', 'web, prod', '', '', '', ''],
    [
        'db-primary',
        'db.example.com',
        'SSH',
        22,
        'postgres',
        'Production',
        'database',
        '',
        '',
        '',
        'Nightly backup at 02:00',
    ],
    ['gateway', 'gw.example.com', 'SSH', 2222, 'admin', 'Network', '', '', '', '', ''],
];

export const SAMPLE_CSV = `Name,Host,Protocol,Port,Username,Group,Tags,Password,Private Key,Key Passphrase,Notes
prod-web,web.example.com,SSH,22,deploy,Production,"web,prod",,,,
db-primary,db.example.com,SSH,22,postgres,Production,database,,,,Nightly backup at 02:00
gateway,gw.example.com,SSH,2222,admin,Network,,,,,
`;

export const SAMPLE_JSON = `{
  "format": "termix-export",
  "version": 1,
  "encrypted": false,
  "payload": {
    "servers": [
      {
        "name": "prod-web",
        "host": "web.example.com",
        "protocol": "SSH",
        "port": 22,
        "username": "deploy",
        "groupName": "Production",
        "tags": ["web", "prod"]
      }
    ]
  }
}
`;
