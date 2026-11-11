# Termi usage statistics

Updated 2026-11-11 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.1

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 891 | — | — |
| Docker pulls, gateway | 917 | — | — |
| Desktop installers downloaded | 148 | — | — |
| …macOS Intel | 21 | — | — |
| …macOS Apple Silicon | 50 | — | — |
| …Windows | 33 | — | — |
| …Linux x64 | 32 | — | — |
| …Linux arm64 | 12 | — | — |
| Desktop update checks | 257 | — | — |
| GitHub stars | 9 | — | — |
| GitHub forks | 1 | — | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 74 (12) | 90 (26) |
| Clones | 1,500 (177) | 1,553 (202) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
