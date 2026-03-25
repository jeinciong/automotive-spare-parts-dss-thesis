import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { 
  User, Bell, Database, Shield, Palette, Download, Upload, Mail, Smartphone, DollarSign, Clock, Save,
  AlertCircle, Users, UserPlus, Building2,
  Trash2,
  Pencil
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../ui/dialog";
import { motion, AnimatePresence } from "motion/react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";

interface TeamMember {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: "Business Owner" | "Team Member";
  createdAt: string;
}

export function SettingsView() {
  // User & Team States
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  
  // Notification States
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [salesAlerts, setSalesAlerts] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  
  // New Member Form State
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberFullName, setNewMemberFullName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");

  const [businessInfo, setBusinessInfo] = useState({
    name: savedUser.user_name || "",
    email: savedUser.email || "",
    address: "123 Thesis St. Tanza, Cavite" // Fallback
  });

  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [passwords, setPasswords] = useState({ old: "", new: "", confirm: "" });


  const handleUpdateBusiness = async () => {
    const response = await fetch(`http://localhost:5000/api/business/${savedUser.company_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            company_name: businessInfo.name,
            email: businessInfo.email,
            business_address: businessInfo.address
        })
    });
      if (response.ok) {
          // Update local storage so the UI stays synced
          const updatedUser = { ...savedUser, user_name: businessInfo.name, email: businessInfo.email };
          localStorage.setItem("user", JSON.stringify(updatedUser));
          toast.success("Business profile updated!");
      }
  };

  const handleChangePassword = async () => {
      if (passwords.new !== passwords.confirm) return toast.error("Passwords do not match");
      
      const response = await fetch(`http://localhost:5000/api/change-password/${savedUser.company_id || savedUser.user_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              oldPassword: passwords.old,
              newPassword: passwords.new,
              isStaff: !!savedUser.user_id
          })
      });
      
      if (response.ok) {
          toast.success("Password changed!");
          setPasswords({ old: "", new: "", confirm: "" });
      } else {
          toast.error("Invalid old password");
      }
  };

  const handleDeleteAccount = async () => {
      if (window.confirm("WARNING: This will permanently delete your business and all data. Proceed?")) {
          const response = await fetch(`http://localhost:5000/api/business/${savedUser.company_id}`, { method: 'DELETE' });
          if (response.ok) {
              localStorage.clear();
              window.location.href = "/login";
          }
      }
  };

  // Data Export Function
  const exportData = async () => {
    try {
        const response = await fetch(`http://localhost:5000/api/export-all?company_id=${savedUser.company_id}`);
        
        if (!response.ok) throw new Error("Server export failed");

        const fullData = await response.json();
        
        // Convert to string with 2-space indentation for readability
        const jsonString = JSON.stringify(fullData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        
        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Business_Backup_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success("Full business database exported!");
    } catch (error) {
        console.error("Export Error:", error);
        toast.error("Failed to export database");
    }
  };

  // Appearance
  const toggleTheme = (mode: string) => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (mode === "dark") root.classList.add("dark");
    localStorage.setItem("theme", mode);
    toast.info(`Theme set to ${mode} mode`);
  };

  const deleteStaff = async (userId: string) => {
    if (!window.confirm("Delete this staff account?")) return;
    const response = await fetch(`http://localhost:5000/api/team/${userId}`, { method: 'DELETE' });
      if (response.ok) {
          setTeamMembers(prev => prev.filter(m => m.id !== userId));
          toast.success("Staff member removed");
      }
  };

  const handleEditClick = (m: TeamMember) => {
    setEditingMember({ ...m });
    setIsEditMemberOpen(true);
  };

  const handleUpdateStaff = async () => {
    if (!editingMember || !editingMember.id) {
      toast.error("No member selected");
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/team/${editingMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editingMember.fullName,
          email: editingMember.email,
          role: editingMember.role === "Business Owner" ? "Admin" : "Business" 
        }),
      });

      if (response.ok) {
        // Update local state so UI refreshes without reload
        setTeamMembers(prev => prev.map(member => 
          member.id === editingMember.id ? editingMember : member
        ));
        setIsEditMemberOpen(false);
        toast.success("Staff updated successfully");
      } else {
        toast.error("Update failed on server");
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Connection failed");
    }
  };

  const getRoleBadgeColor = (role: string) => {
    return role === "Business Owner" 
      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" 
      : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white";
  };

  // Fetch Team on Mount
  useEffect(() => {
    const fetchTeam = async () => {
      if (!savedUser.company_id) return;
      try {
        const response = await fetch(`http://localhost:5000/api/team?company_id=${savedUser.company_id}`);
        if (response.ok) {
          const data = await response.json();
          const mappedTeam = data.map((m: any) => ({
            id: m.user_id.toString(),
            username: m.email.split('@')[0],
            email: m.email,
            fullName: m.full_name,
            role: m.role === 'Admin' ? "Business Owner" : "Team Member",
            createdAt: m.created_at ? m.created_at.split('T')[0] : "N/A"
          }));
          setTeamMembers(mappedTeam);
        }
      } catch (error) {
        console.error("Error fetching team:", error);
      }
    };
    fetchTeam();
  }, [savedUser.company_id]);


  const handleAddTeamMember = async () => {
    if (!newMemberEmail || !newMemberFullName || !newMemberPassword) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      const response = await fetch('http://localhost:5000/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newMemberFullName,
          email: newMemberEmail,
          password: newMemberPassword,
          company_id: savedUser.company_id
        }),
      });

      if (response.ok) {
        const createdStaff = await response.json();
        const memberForUI: TeamMember = {
          id: createdStaff.user_id.toString(),
          username: createdStaff.email.split('@')[0],
          email: createdStaff.email,
          fullName: createdStaff.full_name,
          role: "Team Member",
          createdAt: new Date().toISOString().split('T')[0]
        };
        setTeamMembers(prev => [...prev, memberForUI]);
        setNewMemberEmail(""); setNewMemberFullName(""); setNewMemberPassword("");
        setIsAddMemberOpen(false);
        toast.success("Staff account created successfully!");
      }
    } catch (error) {
      toast.error("Connection failed");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your automotive business preferences and team.</p>
      </header>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6 mb-8">
          <TabsTrigger value="general"><User className="w-4 h-4 mr-2" />General</TabsTrigger>
          <TabsTrigger value="team"><Users className="w-4 h-4 mr-2" />Team</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" />Notifications</TabsTrigger>
          <TabsTrigger value="data"><Database className="w-4 h-4 mr-2" />Data</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="w-4 h-4 mr-2" />Appearance</TabsTrigger>
          <TabsTrigger value="security"><Shield className="w-4 h-4 mr-2" />Security</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Business Information</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input 
                    value={businessInfo.name} 
                    onChange={(e) => setBusinessInfo({...businessInfo, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Registration Email</Label>
                  <Input 
                    value={businessInfo.email} 
                    onChange={(e) => setBusinessInfo({...businessInfo, email: e.target.value})} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Business Address</Label>
                <Input 
                  value={businessInfo.address} 
                  onChange={(e) => setBusinessInfo({...businessInfo, address: e.target.value})} 
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleUpdateBusiness} className="bg-gradient-to-r from-indigo-600 to-purple-600">
              <Save className="w-4 h-4 mr-2" />Save Changes
            </Button>
          </div>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-[#FF6B00]" />Team Management</CardTitle>
                <CardDescription>Accounts linked to {savedUser.user_name}</CardDescription>
              </div>
              <Button onClick={() => setIsAddMemberOpen(true)} className="bg-[#FF6B00]"><UserPlus className="w-4 h-4 mr-2" />Add Staff</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.fullName}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell><Badge className={getRoleBadgeColor(m.role)}>{m.role}</Badge></TableCell>
                      <TableCell>{m.createdAt}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEditClick(m)}
                          >
                            <Pencil className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => deleteStaff(m.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Alert Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Low Stock Alerts</Label>
                <Switch checked={lowStockAlerts} onCheckedChange={setLowStockAlerts} />
              </div>
              <div className="flex justify-between items-center">
                <Label>Email Digest</Label>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Backup & Export</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* UPDATE THIS BUTTON */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={exportData}
              >
                <Download className="w-4 h-4 mr-2" />
                Export Database (JSON)
              </Button>
              
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                <Label>Auto-Backup to Cloud</Label>
                <Switch checked={autoBackup} onCheckedChange={setAutoBackup} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Visual Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Label>Theme Mode</Label>
              <Select defaultValue="light" onValueChange={(value) => toggleTheme(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light Mode</SelectItem>
                  <SelectItem value="dark">Dark Mode</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Access Control</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input 
                    type="password" 
                    placeholder="Type old password" 
                    value={passwords.old} 
                    onChange={(e) => setPasswords({...passwords, old: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input 
                    type="password" 
                    placeholder="New Password" 
                    value={passwords.new} 
                    onChange={(e) => setPasswords({...passwords, new: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input 
                    type="password" 
                    placeholder="Confirm New Password" 
                    value={passwords.confirm} 
                    onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} 
                  />
                </div>
                <Button onClick={handleChangePassword} className="w-full" variant="outline">
                  Update Credentials
                </Button>
              <Separator />
              <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                <p className="text-red-600 text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Danger Zone
                </p>
                <p className="text-xs text-red-500 mt-1">Permanently remove your business and all associated data.</p>
                <Button 
                  variant="destructive" 
                  className="mt-4 w-full" 
                  onClick={handleDeleteAccount}
                >
                  Delete Business Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Staff Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Full Name" value={newMemberFullName} onChange={(e) => setNewMemberFullName(e.target.value)} />
            <Input placeholder="Email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} />
          </div>
          <DialogFooter><Button onClick={handleAddTeamMember} className="bg-[#FF6B00]">Create Account</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={isEditMemberOpen} onOpenChange={setIsEditMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-500" />
              Edit Team Member
            </DialogTitle>
            <DialogDescription>
              Update the name or email for this staff account.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input 
                value={editingMember?.fullName || ""} 
                onChange={(e) => setEditingMember(prev => prev ? {...prev, fullName: e.target.value} : null)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input 
                value={editingMember?.email || ""} 
                onChange={(e) => setEditingMember(prev => prev ? {...prev, email: e.target.value} : null)} 
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditMemberOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStaff} className="bg-blue-600 hover:bg-blue-700 text-white">
              Update Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}