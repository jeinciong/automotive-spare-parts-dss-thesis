import { useState } from "react";
import { Eye, EyeOff, Settings, Gauge, BarChart3, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface LoginPageProps {
  onLogin: (userData: { role: string; company_id: number; email: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSignUp && password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsLoading(true);

    const url = isSignUp
      ? "http://localhost:5000/api/register"
      : "http://localhost:5000/api/login";

    const body = isSignUp
      ? { email, password, companyName, businessAddress }
      : { email, password };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const userData = await response.json();
        onLogin(userData);
      } else {
        const error = await response.json();
        alert(error.message || "Registration/Login failed");
      }
    } catch (error) {
      console.error("Connection error:", error);
      alert("Could not connect to the server. Ensure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#212121] via-[#607D8B] to-[#FF6B00] flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      
      {/* Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-10 left-6 sm:top-20 sm:left-20 animate-pulse">
          <BarChart3 className="w-20 h-20 sm:w-32 sm:h-32 text-white rotate-12" />
        </div>
        <div className="absolute bottom-20 right-6 sm:bottom-32 sm:right-24 animate-pulse" style={{ animationDelay: "1s" }}>
          <TrendingUp className="w-16 h-16 sm:w-24 sm:h-24 text-white -rotate-45" />
        </div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center relative z-10">

        {/* Desktop Left Side (UNCHANGED) */}
        <div className="hidden lg:block text-white space-y-8">
          <div className="flex items-center space-x-3">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-white text-4xl font-bold">AutoParts Pro</h1>
              <p className="text-[#B0BEC5]">Sales Analytics Platform</p>
            </div>
          </div>

          <div className="space-y-6 bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
            <h2 className="text-white text-2xl font-semibold">Business Solutions</h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Settings className="w-6 h-6 text-[#FF6B00]" />
                <p className="text-[#B0BEC5]">Multi-tenant architecture for spare parts businesses.</p>
              </div>
              <div className="flex items-start space-x-3">
                <Gauge className="w-6 h-6 text-[#FF6B00]" />
                <p className="text-[#B0BEC5]">Direct owner management and staff activity tracking.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side */}
        <div className="w-full">

          {/* Mobile Branding */}
          <div className="lg:hidden text-white text-center space-y-2 mb-3">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold">AutoParts Pro</h1>
            </div>
            <p className="text-[#B0BEC5] text-sm">Sales Analytics Platform</p>
          </div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="w-full max-w-full sm:max-w-md border-0 shadow-2xl backdrop-blur-xl bg-white/95 overflow-hidden">
              
              <CardHeader>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isSignUp ? "signup" : "signin"}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                  >
                    <CardTitle className="text-center text-xl sm:text-2xl">
                      {isSignUp ? "Register Business" : "Welcome Back"}
                    </CardTitle>

                    <CardDescription className="text-center text-sm sm:text-base">
                      {isSignUp
                        ? "Create your master business account"
                        : "Sign in to manage your operations"}
                    </CardDescription>
                  </motion.div>
                </AnimatePresence>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  
                  <AnimatePresence mode="wait">
                    {isSignUp && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 sm:space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="companyName">Business Name</Label>
                          <Input
                            id="companyName"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            required
                            className="h-11 sm:h-auto"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="businessAddress">Business Address</Label>
                          <Input
                            id="businessAddress"
                            value={businessAddress}
                            onChange={(e) => setBusinessAddress(e.target.value)}
                            required
                            className="h-11 sm:h-auto"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 sm:h-auto"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="pr-10 h-11 sm:h-auto"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {isSignUp && (
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="h-11 sm:h-auto"
                      />
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-[#FF6B00] hover:bg-[#FF8A50] text-white py-4 sm:py-6 text-base sm:text-lg shadow-lg"
                    disabled={isLoading}
                  >
                    {isLoading
                      ? "Processing..."
                      : isSignUp
                      ? "Create Business Account"
                      : "Sign In"}
                  </Button>

                  <p className="text-center text-xs sm:text-sm text-gray-500">
                    {isSignUp
                      ? "Already have a business account? "
                      : "New business owner? "}
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-[#FF6B00] font-semibold hover:underline"
                    >
                      {isSignUp ? "Sign in" : "Register here"}
                    </button>
                  </p>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          {/* Mobile Business Solutions (NEW) */}
          <div className="lg:hidden mt-6 space-y-4 bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
            <h2 className="text-white text-lg font-semibold text-center">
              Business Solutions
            </h2>

            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Settings className="w-5 h-5 text-[#FF6B00]" />
                <p className="text-[#B0BEC5] text-sm">
                  Multi-tenant architecture for spare parts businesses.
                </p>
              </div>

              <div className="flex items-start space-x-3">
                <Gauge className="w-5 h-7 text-[#FF6B00]" />
                <p className="text-[#B0BEC5] text-sm">
                  Direct owner management and staff activity tracking.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}