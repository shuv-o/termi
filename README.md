# Termi usage statistics

Updated 2026-11-24 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.2

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 1,110 | +217 | — |
| Docker pulls, gateway | 1,205 | +214 | — |
| Desktop installers downloaded | 169 | +14 | — |
| …macOS Intel | 22 | +1 | — |
| …macOS Apple Silicon | 59 | +3 | — |
| …Windows | 35 | +2 | — |
| …Linux x64 | 40 | +7 | — |
| …Linux arm64 | 13 | +1 | — |
| Desktop update checks | 267 | +10 | — |
| GitHub stars | 9 | +0 | — |
| GitHub forks | 1 | +0 | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 53 (11) | 144 (38) |
| Clones | 293 (86) | 1,979 (361) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
