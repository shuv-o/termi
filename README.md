# Termi usage statistics

Updated 2026-11-26 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.2

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 1,112 | +152 | — |
| Docker pulls, gateway | 1,205 | +137 | — |
| Desktop installers downloaded | 177 | +21 | — |
| …macOS Intel | 22 | +1 | — |
| …macOS Apple Silicon | 61 | +5 | — |
| …Windows | 41 | +8 | — |
| …Linux x64 | 40 | +6 | — |
| …Linux arm64 | 13 | +1 | — |
| Desktop update checks | 270 | +11 | — |
| GitHub stars | 9 | +0 | — |
| GitHub forks | 1 | +0 | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 58 (14) | 149 (41) |
| Clones | 279 (76) | 2,004 (373) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
