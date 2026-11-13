# Termi usage statistics

Updated 2026-11-13 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.1

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 891 | — | — |
| Docker pulls, gateway | 957 | — | — |
| Desktop installers downloaded | 151 | — | — |
| …macOS Intel | 21 | — | — |
| …macOS Apple Silicon | 53 | — | — |
| …Windows | 33 | — | — |
| …Linux x64 | 32 | — | — |
| …Linux arm64 | 12 | — | — |
| Desktop update checks | 257 | — | — |
| GitHub stars | 9 | — | — |
| GitHub forks | 1 | — | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 71 (11) | 91 (27) |
| Clones | 1,532 (194) | 1,640 (242) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
