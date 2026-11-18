# Termi usage statistics

Updated 2026-11-18 from public download counts. Termi itself sends no data anywhere.
Latest release: v1.2.1

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
| Docker pulls, web | 957 | +66 | — |
| Docker pulls, gateway | 1,065 | +148 | — |
| Desktop installers downloaded | 155 | +7 | — |
| …macOS Intel | 21 | +0 | — |
| …macOS Apple Silicon | 56 | +6 | — |
| …Windows | 33 | +0 | — |
| …Linux x64 | 33 | +1 | — |
| …Linux arm64 | 12 | +0 | — |
| Desktop update checks | 257 | +0 | — |
| GitHub stars | 9 | +0 | — |
| GitHub forks | 1 | +0 | — |

## GitHub traffic

| | Last 7 days | Last 30 days |
| --- | --- | --- |
| Page views | 0 (0) | 91 (27) |
| Clones | 83 (53) | 1,686 (275) |

In brackets: unique visitors (or cloners) per day, added up.

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: `history.json` (one snapshot per day), `traffic.json` (daily views and clones).
