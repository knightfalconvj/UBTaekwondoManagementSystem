import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function RankingsPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    void api.get("/rankings").then((res) => setRows(res.data));
  }, []);

  return (
    <div className="page">
      <section className="panel">
        <h2>Final Team Rankings</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rank</th><th>Athlete</th><th>Belt</th><th>Prev Season</th><th>Total Points</th><th>Final Score</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.athleteProfileId}>
                  <td>{row.rank}</td>
                  <td>{row.athleteName}</td>
                  <td>{row.beltRank}</td>
                  <td>{row.previousSeasonPoints}</td>
                  <td>{row.totalPoints}</td>
                  <td><strong>{row.finalScore}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
