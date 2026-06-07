export const Route = {
  path: '/terms',
  component: TermsPage,
};

function TermsPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        
        <section className="space-y-6 text-muted-foreground">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Experimental Platform</h2>
            <p>Chatly is an experimental platform. Users are responsible for content they post and share.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. User Responsibility</h2>
            <p>Users are solely responsible for the content they create, post, and transmit through the platform.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. No Liability</h2>
            <p>We accept no liability for user-generated content or any damages arising from the use of this platform.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Anarchic Nature</h2>
            <p>This platform operates with minimal moderation. Anarchic and unfiltered environments may develop.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. User Conduct</h2>
            <p>Users agree to not engage in illegal activities or violate the rights of others.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
