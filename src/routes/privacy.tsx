export const Route = {
  path: '/privacy',
  component: PrivacyPage,
};

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        
        <section className="space-y-6 text-muted-foreground">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Data Collection</h2>
            <p>We collect minimal user data: username, email, and profile information necessary for platform operation.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Data Storage</h2>
            <p>User data is stored securely using Supabase with PostgreSQL encryption.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Data Usage</h2>
            <p>Data is used solely for providing and improving the Chatly service.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Third Parties</h2>
            <p>We do not share user data with third parties except as required by law.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. User Rights</h2>
            <p>Users can request deletion of their data at any time through account settings.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
